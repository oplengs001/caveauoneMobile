import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  MapPin,
  QrCode,
  Wine,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { OnboardingItem, OnboardingTask } from "../../types";
const NEXT_JS_API_URL = "https://caveauone.vercel.app";
const { width } = Dimensions.get("window");

type Step =
  | "overview"
  | "scan_label"
  | "verify_qr"
  | "success"
  | "select_item_for_report"
  | "select_bottle_for_report";

export default function OnboardingDetailScreen() {
  const { id, openScanner } = useLocalSearchParams<{
    id: string;
    openScanner?: string;
  }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [task, setTask] = useState<OnboardingTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>("overview");
  const [activeItem, setActiveItem] = useState<OnboardingItem | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const lastMismatchAlert = useRef<number>(0);
  const scanAnim = useRef(new Animated.Value(0)).current;

  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [sizeConfirmed, setSizeConfirmed] = useState(false);

  useEffect(() => {
    if (capturedImage) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 2500,
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 2500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      scanAnim.setValue(0);
    }
  }, [capturedImage, scanAnim]);

  useEffect(() => {
    if (openScanner === "true") {
      setCurrentStep("scan_label");
    }
  }, [openScanner]);

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(
      doc(db, "onboarding_tasks", id as string),
      (snap) => {
        if (snap.exists()) {
          setTask({ id: snap.id, ...snap.data() } as OnboardingTask);
        }
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [id]);

  const handleScanLabel = async () => {
    if (!cameraRef.current || isProcessing) return;
    setIsProcessing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });

      if (!photo?.uri || !photo?.base64) {
        throw new Error("Failed to capture photo");
      }

      setCapturedImage(photo.uri);

      // 1. Send to AI Analysis
      const response = await fetch(`${NEXT_JS_API_URL}/api/analyze-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: photo.base64 }),
      });

      if (!response.ok) throw new Error("AI Analysis failed");

      const aiResult = await response.json();
      console.log("AI Scanned Label:", aiResult);

      // 2. Match with Task Items
      // We look for the best match based on wine name and vintage
      const matchedItem = task?.items.find((item) => {
        const wineNameMatch =
          item.wineName
            .toLowerCase()
            .includes(aiResult.wineName.toLowerCase()) ||
          aiResult.wineName.toLowerCase().includes(item.wineName.toLowerCase());
        const vintageMatch = item.vintage === aiResult.vintage;

        // If a specific format was selected, enforce it, otherwise default to any/75cl logic.
        const formatMatch = selectedFormat
          ? item.format === selectedFormat
          : true;

        return (
          wineNameMatch &&
          vintageMatch &&
          formatMatch &&
          item.onboardedQty < item.qty
        );
      });

      if (matchedItem) {
        setActiveItem(matchedItem);
        setSizeConfirmed(matchedItem.format === "75cl");
        setCurrentStep("verify_qr");
        setCapturedImage(null);
      } else {
        alert(
          `Could not find a matching item: ${aiResult.producerName} ${aiResult.vintage}`,
        );
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
    if (!activeItem || !task || isProcessing || !profile?.locationId) return;

    // Check if the scanned QR belongs to the active item's current pending bottle
    const expectedBottleId = activeItem.bottleIds[activeItem.onboardedQty];
    if (scannedData !== expectedBottleId) {
      const now = Date.now();
      if (now - lastMismatchAlert.current > 3000) {
        lastMismatchAlert.current = now;
        alert(`QR Code mismatch! Expected: ${expectedBottleId}`);
      }
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Update the existing Inventory Bottle
      // These bottles were already created as "incoming" in the admin dashboard
      const bottleRef = doc(db, "inventory_bottles", scannedData);
      const storeRef = doc(db, "stores", profile.locationId);

      await updateDoc(bottleRef, {
        status: "received",
        updatedAt: serverTimestamp(),
        storeRef: storeRef,
      });

      // 2. Update Task Progress
      const updatedItems = task.items.map((i) => {
        if (i.id === activeItem.id) {
          return { ...i, onboardedQty: i.onboardedQty + 1 };
        }
        return i;
      });

      const isFullyDone = updatedItems.every((i) => i.onboardedQty === i.qty);

      await updateDoc(doc(db, "onboarding_tasks", task.id), {
        items: updatedItems,
        status: isFullyDone ? "completed" : "warehouse",
        updatedAt: serverTimestamp(),
      });

      setCurrentStep("success");
    } catch (err: any) {
      console.error(err);
      alert("Error updating bottle: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReportIssueForItem = (item: OnboardingItem) => {
    setActiveItem(item);
    setCurrentStep("select_bottle_for_report");
  };

  const handleSelectBottleToReport = (bottleId: string) => {
    if (!activeItem) return;
    Alert.alert("Report an Issue", `What's wrong with bottle ${bottleId}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "QR Label is Missing",
        onPress: () => processReport("missing_qr_label", activeItem, bottleId),
      },
      {
        text: "Physical Bottle is Missing",
        onPress: () => processReport("missing_bottle", activeItem, bottleId),
      },
    ]);
  };

  const processReport = async (
    reason: "missing_bottle" | "missing_qr_label",
    item: OnboardingItem,
    bottleId: string,
  ) => {
    if (!item || !task || !profile) return;
    setIsProcessing(true);
    try {
      const newReport = {
        itemId: item.id,
        wineName: item.wineName,
        sku: item.sku,
        reportedBy: profile.email,
        reportedAt: Timestamp.now(),
        reason: reason,
        bottleId: bottleId,
      };

      const updatedItems = task.items.map((i) => {
        if (i.id !== item.id) return i;

        // Reorder bottleIds to move the reported one to the current position
        const newBottleIds = [...i.bottleIds];
        const reportedBottleIndex = newBottleIds.indexOf(bottleId);
        const nextOnboardIndex = i.onboardedQty;

        if (
          reportedBottleIndex !== -1 &&
          reportedBottleIndex !== nextOnboardIndex
        ) {
          // Swap
          const temp = newBottleIds[nextOnboardIndex];
          newBottleIds[nextOnboardIndex] = newBottleIds[reportedBottleIndex];
          newBottleIds[reportedBottleIndex] = temp;
        }

        return {
          ...i,
          onboardedQty: i.onboardedQty + 1,
          bottleIds: newBottleIds,
        };
      });

      const isFullyDone = updatedItems.every((i) => i.onboardedQty === i.qty);

      await updateDoc(doc(db, "onboarding_tasks", task.id), {
        items: updatedItems,
        reports: [...(task.reports || []), newReport],
        status: isFullyDone ? "completed" : "warehouse",
        updatedAt: serverTimestamp(),
      });

      alert("Issue reported. You can now scan the next bottle.");
      setCurrentStep("overview");
    } catch (err: any) {
      console.error(err);
      alert("Error reporting issue: " + err.message);
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
        <TouchableOpacity
          onPress={() =>
            currentStep === "overview"
              ? router.back()
              : setCurrentStep("overview")
          }
          style={styles.backButton}
        >
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerLabel}>Intake Task</Text>
          <Text style={styles.headerTitle}>
            #{task.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
      </View>

      {currentStep === "overview" && (
        <ScrollView style={styles.content}>
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Progress Overview</Text>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${(task.items.reduce((s, i) => s + i.onboardedQty, 0) / task.items.reduce((s, i) => s + i.qty, 0)) * 100}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.statsValue}>
              {task.items.reduce((s, i) => s + i.onboardedQty, 0)} /{" "}
              {task.items.reduce((s, i) => s + i.qty, 0)} Bottles Verified
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Wine Items</Text>
          {task.items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemIcon}>
                <Wine
                  size={24}
                  color={item.onboardedQty === item.qty ? "#10b981" : "#4f46e5"}
                />
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
                <Text
                  style={[
                    styles.qtyText,
                    item.onboardedQty === item.qty && { color: "#10b981" },
                  ]}
                >
                  {item.onboardedQty}/{item.qty}
                </Text>
                {item.onboardedQty === item.qty && (
                  <CheckCircle2 size={16} color="#10b981" />
                )}
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.mainButton}
            onPress={() => setCurrentStep("scan_label")}
          >
            <Camera size={24} color="#fff" />
            <Text style={styles.mainButtonText}>Scan Bottle Label</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setCurrentStep("select_item_for_report")}
          >
            <Text style={styles.secondaryButtonText}>Report an Issue</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {currentStep === "select_item_for_report" && (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>Which item has an issue?</Text>
          {task.items
            .filter((item) => item.onboardedQty < item.qty)
            .map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => handleReportIssueForItem(item)}
              >
                <View style={styles.itemIcon}>
                  <Wine size={24} color={"#4f46e5"} />
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
                  <Text style={styles.qtyText}>
                    {item.onboardedQty}/{item.qty}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
        </ScrollView>
      )}

      {currentStep === "select_bottle_for_report" && activeItem && (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>
            Which bottle of {activeItem.wineName} has an issue?
          </Text>
          {activeItem.bottleIds
            .slice(activeItem.onboardedQty)
            .map((bottleId) => (
              <TouchableOpacity
                key={bottleId}
                style={styles.bottleIdCard}
                onPress={() => handleSelectBottleToReport(bottleId)}
              >
                <QrCode size={24} color="#94a3b8" />
                <Text style={styles.bottleIdText}>{bottleId}</Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
      )}

      {currentStep === "scan_label" && (
        <View style={styles.cameraContainer}>
          {!permission?.granted ? (
            <View style={styles.centerContainer}>
              <Text style={styles.permissionText}>
                Camera permission needed
              </Text>
              <TouchableOpacity
                onPress={requestPermission}
                style={styles.mainButton}
              >
                <Text style={styles.mainButtonText}>Grant Permission</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.camera}>
              {capturedImage ? (
                <View style={styles.capturedContainer}>
                  <Image
                    source={{ uri: capturedImage }}
                    style={styles.capturedImage}
                  />

                  <Animated.View
                    style={[
                      styles.laserScanner,
                      {
                        transform: [
                          {
                            translateY: scanAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [
                                -200,
                                Dimensions.get("window").height,
                              ],
                            }),
                          },
                        ],
                      },
                    ]}
                  />

                  <View style={styles.analyzingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.analyzingText}>
                      Analyzing wine label...
                    </Text>
                  </View>
                </View>
              ) : (
                <CameraView style={styles.camera} ref={cameraRef}>
                  <View style={styles.cameraOverlay}>
                    <View style={styles.scannerFrame} />

                    {/* Format Selector */}
                    <View style={styles.formatSelectorContainer}>
                      <TouchableOpacity
                        style={styles.formatToggleButton}
                        onPress={() => setShowFormatPicker(!showFormatPicker)}
                      >
                        <Text style={styles.formatToggleText}>
                          {selectedFormat
                            ? `Format: ${selectedFormat}`
                            : "Standard Format (75cl)? Tap to change"}
                        </Text>
                      </TouchableOpacity>

                      {showFormatPicker && (
                        <View style={styles.formatChipsWrapper}>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.formatChips}
                          >
                            {["37.5cl", "75cl", "150cl", "300cl", "600cl"].map(
                              (fmt) => (
                                <TouchableOpacity
                                  key={fmt}
                                  style={[
                                    styles.formatChip,
                                    selectedFormat === fmt &&
                                      styles.formatChipSelected,
                                  ]}
                                  onPress={() => {
                                    setSelectedFormat(
                                      fmt === "75cl" ? null : fmt,
                                    );
                                    setShowFormatPicker(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.formatChipText,
                                      selectedFormat === fmt &&
                                        styles.formatChipTextSelected,
                                    ]}
                                  >
                                    {fmt}
                                  </Text>
                                </TouchableOpacity>
                              ),
                            )}
                          </ScrollView>
                        </View>
                      )}
                    </View>

                    <Text style={styles.scannerInstruction}>
                      Scan bottle label to identify wine
                    </Text>
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

      {currentStep === "verify_qr" && activeItem && (
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
              <Text style={styles.qrIdText}>
                Apply Label: {activeItem.bottleIds[activeItem.onboardedQty]}
              </Text>
              <Text style={styles.skuLabel}>SKU: {activeItem.sku}</Text>
              <Text style={styles.qrDesc}>
                Stick this QR code on the bottle and scan it to confirm.
              </Text>
            </View>
          </View>

          {!sizeConfirmed && activeItem.format !== "75cl" ? (
            <View style={styles.confirmFormatCard}>
              <Text style={styles.confirmFormatTitle}>Confirm Bottle Size</Text>
              <Text style={styles.confirmFormatDesc}>
                This label matched a{" "}
                <Text style={{ fontWeight: "900", color: "#f59e0b" }}>
                  {activeItem.format}
                </Text>{" "}
                bottle. Please physically verify the bottle size before applying
                the sticker.
              </Text>
              <TouchableOpacity
                style={styles.confirmFormatButton}
                onPress={() => setSizeConfirmed(true)}
              >
                <Text style={styles.confirmFormatButtonText}>
                  Confirm {activeItem.format} Size
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelFormatButton}
                onPress={() => setCurrentStep("scan_label")}
              >
                <Text style={styles.cancelFormatButtonText}>
                  Cancel & Rescan
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.qrScannerPlaceholder}>
              <CameraView
                style={styles.qrCamera}
                onBarcodeScanned={({ data }) => handleVerifyQR(data)}
              />
              <View style={styles.qrOverlay}>
                <View style={styles.qrFrame} />
                <Text style={styles.qrInstruction}>
                  Scan the applied QR code
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {currentStep === "success" && activeItem && (
        <View style={styles.successContainer}>
          <View style={styles.successCircle}>
            <CheckCircle2 size={80} color="#10b981" strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>Bottle Verified!</Text>
          <Text style={styles.successDesc}>
            The bottle has been matched and the QR code is verified.
          </Text>

          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: "#10b981", marginTop: 40 },
            ]}
            onPress={() =>
              router.push({
                pathname: "/tagging",
                params: {
                  bottleId: activeItem.bottleIds[activeItem.onboardedQty],
                  source: "onboarding",
                  fromOnboardingId: id,
                },
              })
            }
          >
            <MapPin size={24} color="#fff" />
            <Text style={styles.mainButtonText}>Add Location Tag Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setCurrentStep("overview")}
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
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  headerLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  content: {
    flex: 1,
    padding: 24,
  },
  statsCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
  },
  statsTitle: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: "#0f172a",
    borderRadius: 6,
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4f46e5",
    borderRadius: 6,
  },
  statsValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  sectionTitle: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 16,
    letterSpacing: 1,
  },
  itemCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 16,
  },
  itemIcon: {
    width: 48,
    height: 48,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInfo: {
    flex: 1,
  },
  producerText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  wineNameText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  itemMeta: {
    flexDirection: "row",
    gap: 8,
  },
  metaBadge: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "#334155",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemProgress: {
    alignItems: "center",
    gap: 4,
  },
  qtyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  formatSelectorContainer: {
    position: "absolute",
    bottom: 40,
    left: 20,
    alignItems: "flex-start",
    zIndex: 10,
  },
  formatToggleButton: {
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  formatToggleText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
  formatChipsWrapper: {
    width: "100%",
  },
  formatChips: {
    paddingHorizontal: 20,
    gap: 12,
  },
  formatChip: {
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#475569",
  },
  formatChipSelected: {
    backgroundColor: "#4f46e5",
    borderColor: "#6366f1",
  },
  formatChipText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "800",
  },
  formatChipTextSelected: {
    color: "#fff",
  },
  mainButton: {
    flexDirection: "row",
    backgroundColor: "#4f46e5",
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
  },
  mainButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  scannerFrame: {
    width: width * 0.7,
    height: width * 0.9,
    borderWidth: 2,
    borderColor: "#4f46e5",
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  scannerInstruction: {
    position: "absolute",
    bottom: 140,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    width: "100%",
  },
  captureButton: {
    position: "absolute",
    bottom: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
  },
  verifyContainer: {
    flex: 1,
    padding: 24,
  },
  matchCard: {
    backgroundColor: "#fff",
    borderRadius: 32,
    padding: 24,
    marginBottom: 24,
  },
  matchLabel: {
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  matchProducer: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "800",
  },
  matchName: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  matchMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  matchMetaText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
  },
  qrInstructionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  qrIdText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 12,
    fontFamily: "System",
  },
  skuLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 4,
    fontFamily: "System",
  },
  qrDesc: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginTop: 8,
    fontWeight: "500",
  },
  qrScannerPlaceholder: {
    flex: 1,
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  qrCamera: {
    flex: 1,
  },
  qrOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  qrFrame: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "#4f46e5",
    backgroundColor: "transparent",
  },
  qrInstruction: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 24,
  },
  confirmFormatCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f59e0b",
  },
  confirmFormatTitle: {
    color: "#f59e0b",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 8,
  },
  confirmFormatDesc: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  confirmFormatButton: {
    backgroundColor: "#f59e0b",
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  confirmFormatButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  cancelFormatButton: {
    marginTop: 12,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "#334155",
  },
  cancelFormatButtonText: {
    color: "#cbd5e1",
    fontSize: 16,
    fontWeight: "700",
  },
  successContainer: {
    flex: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  successCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  successTitle: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    marginBottom: 12,
  },
  successDesc: {
    color: "#94a3b8",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    fontWeight: "500",
  },
  secondaryButton: {
    padding: 20,
    marginTop: 20,
  },
  secondaryButtonText: {
    color: "#64748b",
    fontSize: 16,
    fontWeight: "800",
  },
  permissionText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  capturedContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  capturedImage: {
    flex: 1,
    resizeMode: "cover",
    opacity: 0.6,
  },
  laserScanner: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 150,
    backgroundColor: "rgba(79, 70, 229, 0.2)",
    borderBottomWidth: 3,
    borderBottomColor: "#6366f1",
    shadowColor: "#6366f1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 10,
    zIndex: 1,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
    zIndex: 2,
  },
  analyzingText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 16,
    padding: 16,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 16,
  },
  reportButtonText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "800",
  },
  bottleIdCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  bottleIdText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    fontFamily: "System",
  },
});
