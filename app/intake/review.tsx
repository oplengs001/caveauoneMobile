import { IconSymbol } from "@/components/ui/icon-symbol";
import { printLabels } from "@/utils/printLabels";
// 1. UPDATED: Import from 'expo-file-system/legacy'
import { db } from "@/lib/firebase";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  DocumentReference,
  getDocs,
} from "firebase/firestore";
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
  const [shouldPrintLabels, setShouldPrintLabels] = useState(true); // New state for checkbox
  const [isAnalyzing, setIsAnalyzing] = useState(true);

  useEffect(() => {
    if (imageUri) {
      analyzeReceipt(imageUri);
    }
  }, [imageUri]);

  const analyzeReceipt = async (uri: string) => {
    try {
      setIsAnalyzing(true);

      // 2. FIXED: This now works correctly using the legacy import
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
      console.log(data, "Data");

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
      Alert.alert(
        "Extraction Failed",
        "Could not read the receipt. Please enter manually.",
      );
      setWines([
        {
          id: "manual-0",
          wineName: "Manual Entry Required",
          quantity: 1,
          vintage: "",
          price: 0,
          producer: "",
          region: "",
          type: "",
          sku: "",
        },
      ]);
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
      const labelsToGenerate: IndividualLabelData[] = []; // Array to collect all labels
      const masterWinesCollection = collection(db, "master_wines");

      // Fetch all existing master wines to efficiently check for duplicates
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
          // Wine exists, get its reference
          masterWineRef = doc(db, "master_wines", masterWineData.id);
        } else {
          // Wine does not exist, create a new master wine entry
          // Attempt to extract vintage from wineName, e.g., "Chateau Margaux 2018"
          const vintageMatch = wine.wineName.match(/\b(19|20)\d{2}\b/);
          const vintage =
            wine.vintage || (vintageMatch ? vintageMatch[0] : "N/V");

          const newMasterWine: Omit<MasterWine, "id"> = {
            name: wine.wineName,
            vintage: vintage,
            price: wine.price || 0,
            producer: wine.producer || "",
            region: wine.region || "",
            type: wine.type || "",
            sku: wine.sku || "",
          };
          const newMasterWineDocRef = await addDoc(
            masterWinesCollection,
            newMasterWine,
          );
          masterWineRef = newMasterWineDocRef;
          masterWineData = { id: newMasterWineDocRef.id, ...newMasterWine };
          existingMasterWines.set(normalizedWineName, masterWineData); // Add to map for subsequent checks
        }

        // Add inventory bottles based on quantity
        for (let i = 0; i < wine.quantity; i++) {
          const newBottle: Omit<InventoryBottle, "id"> = {
            masterWineRef: masterWineRef,
            locationRef: null, // No initial location
            sku: wine.sku || "",
            status: "received",
            receiptId: "", // No receipt ID for now
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
        shouldPrintLabels ? "Success" : "Confirmed",
        shouldPrintLabels
          ? `${totalBottlesProcessed} label(s) sent to printer successfully.`
          : `${totalBottlesProcessed} bottle(s) confirmed without printing.`,
        [
          {
            text: "Return to Dashboard",
            onPress: () => router.replace("/(tabs)/home"),
          },
        ],
      );
    } catch (error) {
      console.error("Processing Error:", error);
      Alert.alert(
        "Processing Failed",
        "There was an issue processing the wines and inventory. Please try again.",
      );
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {imageUri && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUri }}
              style={styles.receiptImage}
              resizeMode="cover"
            />
            <View style={styles.imageOverlay}>
              <Text style={styles.imageOverlayText}>RECEIPT CAPTURED</Text>
            </View>
          </View>
        )}

        <View style={styles.extractionCard}>
          <Text style={styles.cardHeader}>Extraction Result</Text>

          {isAnalyzing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#10b981" />
              <Text style={styles.loadingText}>Reading receipt...</Text>
            </View>
          ) : (
            wines.map((wine, index) => (
              <View key={wine.id} style={styles.wineItem}>
                <View style={styles.wineHeader}>
                  <Text style={styles.label}>
                    WINE {wines.length > 1 ? index + 1 : ""}
                  </Text>
                  {wines.length > 1 && (
                    <TouchableOpacity onPress={() => handleRemoveWine(wine.id)}>
                      <IconSymbol name="trash.fill" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.label}>WINE NAME</Text>
                <TextInput
                  style={styles.input}
                  value={wine.wineName}
                  onChangeText={(text) =>
                    handleUpdateWineDetails(wine.id, "wineName", text)
                  }
                />

                {/* --- Prioritized Fields --- */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.label}>QUANTITY</Text>
                  <View style={styles.stepperContainer}>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => handleUpdateQuantity(wine.id, -1)}
                    >
                      <IconSymbol name="minus" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.quantityValue}>{wine.quantity}</Text>
                    <TouchableOpacity
                      style={styles.stepperButton}
                      onPress={() => handleUpdateQuantity(wine.id, 1)}
                    >
                      <IconSymbol name="plus" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>SKU</Text>
                    <TextInput
                      style={styles.input}
                      value={wine.sku}
                      onChangeText={(text) =>
                        handleUpdateWineDetails(wine.id, "sku", text)
                      }
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>PRICE</Text>
                    <TextInput
                      style={styles.input}
                      value={String(wine.price)}
                      onChangeText={(text) =>
                        handleUpdateWineDetails(
                          wine.id,
                          "price",
                          parseFloat(text) || 0,
                        )
                      }
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* --- Secondary Details Section --- */}
                <View style={styles.secondaryDetailsContainer}>
                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.secondaryLabel}>PRODUCER</Text>
                      <TextInput
                        style={styles.secondaryInput}
                        value={wine.producer}
                        onChangeText={(text) =>
                          handleUpdateWineDetails(wine.id, "producer", text)
                        }
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.secondaryLabel}>VINTAGE</Text>
                      <TextInput
                        style={styles.secondaryInput}
                        value={wine.vintage}
                        onChangeText={(text) =>
                          handleUpdateWineDetails(wine.id, "vintage", text)
                        }
                      />
                    </View>
                  </View>

                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.secondaryLabel}>REGION</Text>
                      <TextInput
                        style={styles.secondaryInput}
                        value={wine.region}
                        onChangeText={(text) =>
                          handleUpdateWineDetails(wine.id, "region", text)
                        }
                      />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.secondaryLabel}>TYPE</Text>
                      <TextInput
                        style={styles.secondaryInput}
                        value={wine.type}
                        onChangeText={(text) =>
                          handleUpdateWineDetails(wine.id, "type", text)
                        }
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
            styles.footerButton,
            styles.primaryButton,
            (isPrinting || isAnalyzing) && styles.buttonDisabled,
          ]}
          onPress={handleConfirm} // Call the consolidated handler
          disabled={isPrinting || isAnalyzing}
        >
          {isPrinting && shouldPrintLabels ? ( // Show activity indicator only if printing
            <ActivityIndicator color="#fff" />
          ) : (
            shouldPrintLabels && ( // Show printer icon only if printing is enabled
              <IconSymbol name="printer.fill" size={24} color="#fff" />
            )
          )}
          <Text style={styles.footerButtonText}>
            {isPrinting && shouldPrintLabels
              ? "PRINTING..."
              : shouldPrintLabels
                ? "CONFIRM & PRINT"
                : "CONFIRM"}
          </Text>
        </TouchableOpacity>

        <View style={styles.checkboxContainer}>
          <TouchableOpacity
            style={styles.checkbox}
            onPress={() => setShouldPrintLabels(!shouldPrintLabels)}
          >
            <IconSymbol
              name={shouldPrintLabels ? "checkmark.square.fill" : "square"}
              size={20}
              color="#10b981"
            />
          </TouchableOpacity>
          <Text style={styles.checkboxLabel}>
            Print QR Codes after confirmation
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111827" },
  scrollContent: { padding: 24, paddingBottom: 40 },
  imageContainer: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 32,
    borderWidth: 2,
    borderColor: "#374151",
    position: "relative",
  },
  receiptImage: { width: "100%", height: "100%" },
  imageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 8,
    alignItems: "center",
  },
  imageOverlayText: {
    color: "#10b981",
    fontWeight: "800",
    letterSpacing: 1,
    fontSize: 12,
  },
  extractionCard: {
    backgroundColor: "#1f2937",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#374151",
  },
  cardHeader: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 24,
    textAlign: "center",
  },
  wineItem: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  wineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  label: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "#374151",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 16,
  },
  col: {
    flex: 1,
  },
  secondaryDetailsContainer: {
    borderTopWidth: 1,
    borderTopColor: "#374151",
    marginTop: 16,
    paddingTop: 16,
  },
  secondaryLabel: {
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  secondaryInput: {
    backgroundColor: "#374151",
    color: "#fff",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 12,
    fontWeight: "500",
  },
  stepperContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 8,
  },
  stepperButton: {
    backgroundColor: "#374151",
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityValue: { color: "#fff", fontSize: 22, fontWeight: "800" },
  loadingContainer: { alignItems: "center", paddingVertical: 40 },
  loadingText: { color: "#9ca3af", marginTop: 12, fontSize: 16 },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: "#374151",
    backgroundColor: "#111827",
  },
  footerButtonContainer: {
    flexDirection: "row",
    gap: 16,
  },
  footerButton: {
    flexDirection: "row",
    height: 64,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#10b981",
  },
  secondaryButton: {
    backgroundColor: "#374151",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footerButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",

    letterSpacing: 1,
    // marginLeft: shouldPrintLabels ? 12 : 0, // Adjust margin if printer icon is present
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
    gap: 8,
  },
  checkbox: {
    padding: 4,
  },
  checkboxLabel: {
    color: "#e5e7eb",
    fontSize: 14,
  },
  emptyText: { color: "#9ca3af", textAlign: "center", marginTop: 20 },
});
