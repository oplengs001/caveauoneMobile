import { db } from "@/lib/firebase";
import { printLabels } from "@/utils/printLabels";
import * as FileSystem from "expo-file-system/legacy";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  DocumentReference,
  getDocs,
} from "firebase/firestore";
import {
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  FileText,
  Minus,
  Plus,
  Printer,
  ScanText,
  Square,
  Trash2
} from 'lucide-react-native';
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { IndividualLabelData, InventoryBottle, MasterWine } from "../../types";

const NEXT_JS_API_URL = "http://192.168.1.16:3000";

interface ExtractedWine {
  id: string;
  wineName: string;
  quantity: number;
  vintage: string;
  price: number;
  producer?: string;
  region?: string;
  type?: string;
  sku?: string;
}

export default function ReviewScreen() {
  const { imageUri } = useLocalSearchParams<{ imageUri: string }>();
  const router = useRouter();

  const [wines, setWines] = useState<ExtractedWine[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);
  const [shouldPrintLabels, setShouldPrintLabels] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(true);

  useEffect(() => {
    if (imageUri) {
      analyzeReceipt(imageUri);
    }
  }, [imageUri]);

  const analyzeReceipt = async (uri: string) => {
    try {
      setIsAnalyzing(true);
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const response = await fetch(`${NEXT_JS_API_URL}/api/analyze-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: base64 }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Request Failed: ${errorText}`);
      }

      const data = await response.json();
      const mapItemToWine = (item: any, index: number): ExtractedWine => ({
        id: `${Date.now()}-${index}`,
        wineName: item.wineName || "Unknown Wine",
        quantity: item.quantity || 1,
        vintage: item.vintage || "",
        price: item.price || 0,
        producer: item.producer || "",
        region: item.region || "",
        type: item.type || "",
        sku: item.sku || "",
      });

      if (Array.isArray(data)) {
        setWines(data.map(mapItemToWine));
      } else {
        setWines([mapItemToWine(data, 0)]);
      }
    } catch (error) {
      console.error("Analysis Error:", error);
      Alert.alert("Extraction Failed", "Could not read the receipt. Please enter manually.");
      setWines([{
        id: "manual-0",
        wineName: "Manual Entry Required",
        quantity: 1,
        vintage: "",
        price: 0,
        producer: "",
        region: "",
        type: "",
        sku: "",
      }]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateQuantity = (id: string, delta: number) => {
    setWines((prev) =>
      prev.map((wine) =>
        wine.id === id
          ? { ...wine, quantity: Math.max(1, wine.quantity + delta) }
          : wine,
      ),
    );
  };

  const handleRemoveWine = (id: string) => {
    setWines((prev) => prev.filter((wine) => wine.id !== id));
  };

  const handleUpdateWineDetails = (
    id: string,
    field: keyof Omit<ExtractedWine, "id" | "quantity">,
    value: string | number,
  ) => {
    setWines((prev) =>
      prev.map((wine) => (wine.id === id ? { ...wine, [field]: value } : wine)),
    );
  };

  const handleConfirm = async () => {
    if (wines.length === 0) return;

    setIsPrinting(true);
    try {
      const today = new Date();
      const dateStr = `${today.getMonth() + 1}${today.getDate()}${today.getFullYear().toString().slice(2)}`;

      const inventoryBottlesCollection = collection(db, "inventory_bottles");
      const labelsToGenerate: IndividualLabelData[] = [];
      const masterWinesCollection = collection(db, "master_wines");

      const allMasterWinesSnap = await getDocs(masterWinesCollection);
      const existingMasterWines = new Map<string, MasterWine>(
        allMasterWinesSnap.docs.map((doc) => [
          doc.data().name.toLowerCase(),
          { id: doc.id, ...doc.data() } as MasterWine,
        ]),
      );

      let totalBottlesProcessed = 0;

      for (const wine of wines) {
        let masterWineRef: DocumentReference;
        let masterWineData: MasterWine | undefined;

        const normalizedWineName = wine.wineName.toLowerCase();
        masterWineData = existingMasterWines.get(normalizedWineName);

        if (masterWineData) {
          masterWineRef = doc(db, "master_wines", masterWineData.id);
        } else {
          const vintageMatch = wine.wineName.match(/\b(19|20)\d{2}\b/);
          const vintage = wine.vintage || (vintageMatch ? vintageMatch[0] : "N/V");

          const newMasterWine: Omit<MasterWine, "id"> = {
            name: wine.wineName,
            vintage: vintage,
            price: wine.price || 0,
            producer: wine.producer || "",
            region: wine.region || "",
            type: wine.type || "",
            sku: wine.sku || "",
          };
          const newMasterWineDocRef = await addDoc(masterWinesCollection, newMasterWine);
          masterWineRef = newMasterWineDocRef;
          masterWineData = { id: newMasterWineDocRef.id, ...newMasterWine };
          existingMasterWines.set(normalizedWineName, masterWineData);
        }

        for (let i = 0; i < wine.quantity; i++) {
          const newBottle: Omit<InventoryBottle, "id"> = {
            masterWineRef: masterWineRef,
            locationRef: null,
            sku: wine.sku || "",
            status: "received",
            receiptId: "",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          const docRef = await addDoc(inventoryBottlesCollection, newBottle);
          totalBottlesProcessed++;
          labelsToGenerate.push({
            wineName: wine.wineName,
            sku: wine.sku || `BTL-${docRef.id.slice(0, 8)}`,
            dateAdded: dateStr,
            bottleId: docRef.id,
          });
        }
      }

      if (shouldPrintLabels && labelsToGenerate.length > 0) {
        await printLabels(labelsToGenerate);
      }

      Alert.alert(
        shouldPrintLabels ? "Labels Sent" : "Confirmed",
        shouldPrintLabels
          ? `${totalBottlesProcessed} label(s) are being generated.`
          : `${totalBottlesProcessed} bottle(s) added to inventory.`,
        [{ text: "Dashboard", onPress: () => router.replace("/(tabs)/home") }]
      );
    } catch (error) {
      console.error("Processing Error:", error);
      Alert.alert("Processing Failed", "Failed to finalize inventory intake.");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Review Intake</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {imageUri && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUri }}
              style={styles.receiptImage}
              resizeMode="cover"
            />
            <View style={styles.imageOverlay}>
              <ScanText size={14} color="#10b981" strokeWidth={2.5} />
              <Text style={styles.imageOverlayText}>AI RECEIPT ANALYSIS</Text>
            </View>
          </View>
        )}

        <View style={styles.extractionCard}>
          <View style={styles.cardHeaderRow}>
            <FileText size={16} color="#6366f1" />
            <Text style={styles.cardHeader}>Extraction Results</Text>
          </View>

          {isAnalyzing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4f46e5" />
              <Text style={styles.loadingText}>Analyzing document...</Text>
            </View>
          ) : (
            wines.map((wine, index) => (
              <View key={wine.id} style={styles.wineItem}>
                <View style={styles.wineHeader}>
                  <Text style={styles.wineIndex}>
                    WINE #{index + 1}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveWine(wine.id)}>
                    <Trash2 size={18} color="#ef4444" strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Product Name</Text>
                  <TextInput
                    style={styles.input}
                    value={wine.wineName}
                    onChangeText={(text) =>
                      handleUpdateWineDetails(wine.id, "wineName", text)
                    }
                  />
                </View>

                <View style={styles.quantitySection}>
                  <Text style={styles.label}>Quantity to Tag</Text>
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => handleUpdateQuantity(wine.id, -1)}
                    >
                      <Minus size={20} color="#fff" strokeWidth={3} />
                    </TouchableOpacity>
                    <Text style={styles.quantityValue}>{wine.quantity}</Text>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => handleUpdateQuantity(wine.id, 1)}
                    >
                      <Plus size={20} color="#fff" strokeWidth={3} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>SKU / Code</Text>
                    <TextInput
                      style={styles.input}
                      value={wine.sku}
                      onChangeText={(text) =>
                        handleUpdateWineDetails(wine.id, "sku", text)
                      }
                      autoCapitalize="characters"
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Price (₱)</Text>
                    <TextInput
                      style={styles.input}
                      value={String(wine.price)}
                      onChangeText={(text) =>
                        handleUpdateWineDetails(wine.id, "price", parseFloat(text) || 0)
                      }
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.secondaryDetails}>
                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.secondaryLabel}>Producer</Text>
                      <TextInput
                        style={styles.secondaryInput}
                        value={wine.producer}
                        onChangeText={(text) => handleUpdateWineDetails(wine.id, "producer", text)}
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.secondaryLabel}>Vintage</Text>
                      <TextInput
                        style={styles.secondaryInput}
                        value={wine.vintage}
                        onChangeText={(text) => handleUpdateWineDetails(wine.id, "vintage", text)}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (isPrinting || isAnalyzing) && styles.buttonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={isPrinting || isAnalyzing}
        >
          {isPrinting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            shouldPrintLabels ? <Printer size={24} color="#fff" strokeWidth={2.5} /> : <CheckCircle2 size={24} color="#fff" strokeWidth={2.5} />
          )}
          <Text style={styles.primaryButtonText}>
            {isPrinting ? "PROCESSING..." : shouldPrintLabels ? "CONFIRM & PRINT" : "CONFIRM INTAKE"}
          </Text>
        </TouchableOpacity>

        <View style={styles.checkboxContainer}>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => setShouldPrintLabels(!shouldPrintLabels)}
          >
            {shouldPrintLabels ? (
              <CheckSquare size={20} color="#4f46e5" strokeWidth={2.5} />
            ) : (
              <Square size={20} color="#475569" strokeWidth={2.5} />
            )}
          </TouchableOpacity>
          <Text style={styles.checkboxLabel}>
            Auto-generate QR labels for all items
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
    textTransform: 'uppercase',
    letterSpacing: -0.5,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 8,
    paddingBottom: 40
  },
  imageContainer: {
    width: "100%",
    height: 180,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "#334155",
    position: "relative",
    backgroundColor: '#1e293b',
  },
  receiptImage: {
    width: "100%",
    height: "100%",
    opacity: 0.6,
  },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    padding: 12,
    flexDirection: 'row',
    alignItems: "center",
    justifyContent: 'center',
    gap: 8,
  },
  imageOverlayText: {
    color: "#10b981",
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 10,
  },
  extractionCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  cardHeader: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  wineItem: {
    backgroundColor: "#0f172a",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  wineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  wineIndex: {
    color: "#6366f1",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#1e293b",
    color: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
    borderWidth: 1,
    borderColor: "#334155",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  col: {
    flex: 1,
  },
  secondaryDetails: {
    borderTopWidth: 1,
    borderTopColor: "#334155",
    marginTop: 8,
    paddingTop: 16,
  },
  secondaryLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  secondaryInput: {
    backgroundColor: "#1e293b",
    color: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#334155",
  },
  quantitySection: {
    marginBottom: 20,
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  stepperButton: {
    backgroundColor: "#4f46e5",
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityValue: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    fontStyle: 'italic',
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40
  },
  loadingText: {
    color: "#64748b",
    marginTop: 16,
    fontSize: 14,
    fontWeight: '700'
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    backgroundColor: "#0f172a",
  },
  primaryButton: {
    flexDirection: "row",
    height: 64,
    borderRadius: 20,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    gap: 10,
  },
  checkbox: {
    padding: 4,
  },
  checkboxLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: '600',
  },
});

