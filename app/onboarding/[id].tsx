import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  MapPin,
  QrCode,
  Wine
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { OnboardingItem, OnboardingTask } from "../../types";

const { width } = Dimensions.get('window');

type Step = 'overview' | 'scan_label' | 'verify_qr' | 'success';

export default function OnboardingDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [task, setTask] = useState<OnboardingTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>('overview');
  const [activeItem, setActiveItem] = useState<OnboardingItem | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "onboarding_tasks", id as string), (snap) => {
      if (snap.exists()) {
        setTask({ id: snap.id, ...snap.data() } as OnboardingTask);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

  const handleScanLabel = async () => {
    if (!cameraRef.current || isProcessing) return;
    setIsProcessing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5
      });

      if (!photo?.uri || !photo?.base64) {
        throw new Error("Failed to capture photo");
      }

      setCapturedImage(photo.uri);

      // 1. Send to AI Analysis
      const response = await fetch('http://192.168.1.10:3000/api/analyze-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: photo.base64 }),
      });

      if (!response.ok) throw new Error("AI Analysis failed");

      const aiResult = await response.json();
      console.log("AI Scanned Label:", aiResult);

      // 2. Match with Task Items
      // We look for the best match based on wine name and vintage
      const matchedItem = task?.items.find(item => {
        const wineNameMatch = item.wineName.toLowerCase().includes(aiResult.wineName.toLowerCase()) ||
          aiResult.wineName.toLowerCase().includes(item.wineName.toLowerCase());
        const vintageMatch = item.vintage === aiResult.vintage;

        return (wineNameMatch && vintageMatch) && item.onboardedQty < item.qty;
      });

      if (matchedItem) {
        setActiveItem(matchedItem);
        setCurrentStep('verify_qr');
        setCapturedImage(null);
      } else {
        alert(`Could not find a matching item: ${aiResult.producerName} ${aiResult.vintage}`);
        setCapturedImage(null);
      }

    } catch (err) {
      console.error("Scanner Error:", err);
      alert("Error scanning label. Please check your connection.");
      setCapturedImage(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyQR = async (scannedData: string) => {
    if (!activeItem || !task || isProcessing) return;

    // Check if the scanned QR belongs to the active item's current pending bottle
    const expectedBottleId = activeItem.bottleIds[activeItem.onboardedQty];
    if (scannedData !== expectedBottleId) {
      alert(`QR Code mismatch! Expected: ${expectedBottleId}`);
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Update the existing Inventory Bottle
      // These bottles were already created as "incoming" in the admin dashboard
      const bottleRef = doc(db, "inventory_bottles", scannedData);
      
      await updateDoc(bottleRef, {
        status: "received",
        updatedAt: serverTimestamp(),
      });

      // 2. Update Task Progress
      const updatedItems = task.items.map(i => {
        if (i.id === activeItem.id) {
          return { ...i, onboardedQty: i.onboardedQty + 1 };
        }
        return i;
      });

      const isFullyDone = updatedItems.every(i => i.onboardedQty === i.qty);

      await updateDoc(doc(db, "onboarding_tasks", task.id), {
        items: updatedItems,
        status: isFullyDone ? 'completed' : 'warehouse',
        updatedAt: serverTimestamp()
      });

      setCurrentStep('success');
    } catch (err: any) {
      console.error(err);
      alert("Error updating bottle: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!task) return null;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => currentStep === 'overview' ? router.back() : setCurrentStep('overview')} style={styles.backButton}>
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerLabel}>Intake Task</Text>
          <Text style={styles.headerTitle}>#{task.id.slice(0, 8).toUpperCase()}</Text>
        </View>
      </View>

      {currentStep === 'overview' && (
        <ScrollView style={styles.content}>
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Progress Overview</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, {
                width: `${(task.items.reduce((s, i) => s + i.onboardedQty, 0) / task.items.reduce((s, i) => s + i.qty, 0)) * 100}%`
              }]} />
            </View>
            <Text style={styles.statsValue}>
              {task.items.reduce((s, i) => s + i.onboardedQty, 0)} / {task.items.reduce((s, i) => s + i.qty, 0)} Bottles Verified
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Wine Items</Text>
          {task.items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemIcon}>
                <Wine size={24} color={item.onboardedQty === item.qty ? "#10b981" : "#4f46e5"} />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.producerText}>{item.producerName}</Text>
                <Text style={styles.wineNameText}>{item.wineName}</Text>
                <View style={styles.itemMeta}>
                  <Text style={styles.metaBadge}>{item.vintage}</Text>
                  <Text style={styles.metaBadge}>{item.format}</Text>
                </View>
              </View>
              <View style={styles.itemProgress}>
                <Text style={[styles.qtyText, item.onboardedQty === item.qty && { color: '#10b981' }]}>
                  {item.onboardedQty}/{item.qty}
                </Text>
                {item.onboardedQty === item.qty && <CheckCircle2 size={16} color="#10b981" />}
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.mainButton}
            onPress={() => setCurrentStep('scan_label')}
          >
            <Camera size={24} color="#fff" />
            <Text style={styles.mainButtonText}>Scan Bottle Label</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {currentStep === 'scan_label' && (
        <View style={styles.cameraContainer}>
          {!permission?.granted ? (
            <View style={styles.centerContainer}>
              <Text style={styles.permissionText}>Camera permission needed</Text>
              <TouchableOpacity onPress={requestPermission} style={styles.mainButton}>
                <Text style={styles.mainButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.camera}>
              {capturedImage ? (
                <View style={styles.capturedContainer}>
                  <Image source={{ uri: capturedImage }} style={styles.capturedImage} />
                  <View style={styles.analyzingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.analyzingText}>Analyzing wine label...</Text>
                  </View>
                </View>
              ) : (
                <CameraView style={styles.camera} ref={cameraRef}>
                  <View style={styles.cameraOverlay}>
                    <View style={styles.scannerFrame} />
                    <Text style={styles.scannerInstruction}>Scan bottle label to identify wine</Text>
                    <TouchableOpacity
                      style={styles.captureButton}
                      onPress={handleScanLabel}
                      disabled={isProcessing}
                    >
                      <View style={styles.captureInner} />
                    </TouchableOpacity>
                  </View>
                </CameraView>
              )}
            </View>
          )}
        </View>
      )}

      {currentStep === 'verify_qr' && activeItem && (
        <View style={styles.verifyContainer}>
          <View style={styles.matchCard}>
            <Text style={styles.matchLabel}>Bottle Recognized</Text>
            <Text style={styles.matchProducer}>{activeItem.producerName}</Text>
            <Text style={styles.matchName}>{activeItem.wineName}</Text>

            <View style={styles.matchMeta}>
              <Text style={styles.matchMetaText}>{activeItem.vintage}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.matchMetaText}>{activeItem.format}</Text>
            </View>

            <View style={styles.qrInstructionCard}>
              <QrCode size={48} color="#4f46e5" />
              <Text style={styles.qrIdText}>Apply Label: {activeItem.bottleIds[activeItem.onboardedQty]}</Text>
              <Text style={styles.skuLabel}>SKU: {activeItem.sku}</Text>
              <Text style={styles.qrDesc}>Stick this QR code on the bottle and scan it to confirm.</Text>
            </View>
          </View>

          <View style={styles.qrScannerPlaceholder}>
            <CameraView
              style={styles.qrCamera}
              onBarcodeScanned={({ data }) => handleVerifyQR(data)}
            />
            <View style={styles.qrOverlay}>
              <View style={styles.qrFrame} />
              <Text style={styles.qrInstruction}>Scan the applied QR code</Text>
            </View>
          </View>
        </View>
      )}

      {currentStep === 'success' && activeItem && (
        <View style={styles.successContainer}>
          <View style={styles.successCircle}>
            <CheckCircle2 size={80} color="#10b981" strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>Bottle Verified!</Text>
          <Text style={styles.successDesc}>The bottle has been matched and the QR code is verified.</Text>

          <TouchableOpacity
            style={[styles.mainButton, { backgroundColor: '#10b981', marginTop: 40 }]}
            onPress={() => router.push({
              pathname: '/tagging',
              params: { bottleId: activeItem.bottleIds[activeItem.onboardedQty - 1] }
            })}
          >
            <MapPin size={24} color="#fff" />
            <Text style={styles.mainButtonText}>Add Location Tag Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setCurrentStep('overview')}
          >
            <Text style={styles.secondaryButtonText}>Next Bottle</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  statsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
  },
  statsTitle: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4f46e5',
    borderRadius: 6,
  },
  statsValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 16,
    letterSpacing: 1,
  },
  itemCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 16,
  },
  itemIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  producerText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  wineNameText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  metaBadge: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemProgress: {
    alignItems: 'center',
    gap: 4,
  },
  qtyText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  mainButton: {
    flexDirection: 'row',
    backgroundColor: '#4f46e5',
    paddingVertical: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scannerFrame: {
    width: width * 0.7,
    height: width * 0.9,
    borderWidth: 2,
    borderColor: '#4f46e5',
    borderRadius: 24,
    backgroundColor: 'transparent',
  },
  scannerInstruction: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 40,
    textAlign: 'center',
  },
  captureButton: {
    position: 'absolute',
    bottom: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  verifyContainer: {
    flex: 1,
    padding: 24,
  },
  matchCard: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 24,
    marginBottom: 24,
  },
  matchLabel: {
    color: '#4f46e5',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  matchProducer: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '800',
  },
  matchName: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  matchMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  matchMetaText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  qrInstructionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qrIdText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 12,
    fontFamily: 'System',
  },
  skuLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 4,
    fontFamily: 'System',
  },
  qrDesc: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  qrScannerPlaceholder: {
    flex: 1,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  qrCamera: {
    flex: 1,
  },
  qrOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  qrFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 24,
  },
  qrInstruction: {
    color: '#fff',
    fontWeight: '800',
    marginTop: 20,
  },
  successContainer: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  successTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 12,
  },
  successDesc: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  secondaryButton: {
    padding: 20,
    marginTop: 20,
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '800',
  },
  permissionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
  },
  capturedContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  capturedImage: {
    flex: 1,
    resizeMode: 'cover',
    opacity: 0.6,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  analyzingText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  }
});
