import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Image,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { X, Camera, AlertCircle, RefreshCw } from "lucide-react-native";
import { Colors } from "@/constants/theme";
import BottlePickerModal, { BottleWithLocation } from "./BottlePickerModal";
import { similarityScore } from "@/lib/utils/wineMatching";
import { apiFetch } from "@/lib/api";
import { MasterWine, InventoryBottle } from "@/types";

const NEXT_JS_API_URL = process.env.EXPO_PUBLIC_API_URL || "https://caveauone.vercel.app";

interface Props {
  visible: boolean;
  onClose: () => void;
  onBottleSelected: (bottleId: string) => void;
  storeId?: string;
  masterWineId?: string;
  masterWineName?: string;
  theme?: any;
}

type Phase = "camera" | "analyzing" | "bottle_picker" | "mismatch" | "no_match";

export default function LabelScanModal({
  visible,
  onClose,
  onBottleSelected,
  storeId,
  masterWineId,
  masterWineName,
  theme = Colors.store,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>("camera");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lastAiResult, setLastAiResult] = useState<any>(null);
  const [matchedWine, setMatchedWine] = useState<MasterWine | null>(null);
  const [bottlesList, setBottlesList] = useState<BottleWithLocation[]>([]);
  const cameraRef = useRef<CameraView>(null);

  // Pre-fetch all master wines if we don't have a specific wine locked
  const [masterWines, setMasterWines] = useState<MasterWine[]>([]);

  useEffect(() => {
    if (visible && !masterWineId) {
      fetchMasterWines();
    }
  }, [visible, masterWineId]);

  const fetchMasterWines = async () => {
    try {
      const data = await apiFetch("/wines");
      const list: MasterWine[] = data.wines || data;
      setMasterWines(list);
    } catch (err) {
      console.error("Error fetching master wines", err);
    }
  };

  const handleCapture = async () => {
    if (!permission?.granted) {
      const { status } = await requestPermission();
      if (status !== "granted") {
        alert("Camera permission required");
        return;
      }
    }

    if (!cameraRef.current || phase === "analyzing") return;
    setPhase("analyzing");
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.2,
      });

      if (!photo?.uri || !photo?.base64) throw new Error("Failed to capture photo");
      setCapturedImage(photo.uri);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(`${NEXT_JS_API_URL}/api/analyze-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: photo.base64 }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`AI Analysis failed: ${response.status}`);
      const aiResult = await response.json();
      console.log("AI Result:", aiResult);

      let bestMatch: MasterWine | null = null;
      let highestScore = 0;

      if (masterWineId && masterWineName) {
        highestScore = similarityScore(masterWineName, aiResult.wineName || "");
        if (highestScore > 0.5) {
          bestMatch = { id: masterWineId, name: masterWineName } as MasterWine;
        }
      } else {
        for (const wine of masterWines) {
          const score = similarityScore(wine.name || "", aiResult.wineName || "");
          if (score > highestScore) {
            highestScore = score;
            bestMatch = wine;
          }
        }
      }

      if (bestMatch && highestScore > 0.5) {
        setMatchedWine(bestMatch);
        await fetchBottlesForWine(bestMatch.id);
      } else {
        setLastAiResult(aiResult);
        setPhase(masterWineId ? "mismatch" : "no_match");
      }
    } catch (err) {
      console.error(err);
      alert("Error analyzing label.");
      setPhase("camera");
      setCapturedImage(null);
    }
  };

  const fetchBottlesForWine = async (wineId: string) => {
    try {
      const params = new URLSearchParams({
        masterWineId: wineId,
        status: "received,shelved",
      });
      if (storeId) params.set("storeId", storeId);

      const [bottlesData, locationsData] = await Promise.all([
        apiFetch(`/bottles?${params}`),
        apiFetch("/locations"),
      ]);

      const bottles: InventoryBottle[] = bottlesData.bottles || bottlesData;
      const locationsList: any[] = locationsData.locations || locationsData;
      const locationMap: Record<string, string> = {};
      locationsList.forEach((l) => (locationMap[l.id] = l.name));

      const bottleList: BottleWithLocation[] = bottles.map((b: any) => ({
        bottleId: b.id,
        locationName: b.locationId ? (locationMap[b.locationId] || "Assigned") : "Unassigned",
        locationId: b.locationId || "unassigned",
      }));

      const uniqueLocations = new Set(bottleList.map(b => b.locationName));

      if (uniqueLocations.size <= 1 && bottleList.length > 0) {
        onBottleSelected(bottleList[0].bottleId);
        onClose();
      } else if (uniqueLocations.size > 1) {
        setBottlesList(bottleList);
        setPhase("bottle_picker");
      } else {
        setPhase(masterWineId ? "mismatch" : "no_match");
      }
    } catch (err) {
      console.error("Error fetching bottles:", err);
      setPhase("camera");
    }
  };

  const handleReset = () => {
    setPhase("camera");
    setCapturedImage(null);
    setLastAiResult(null);
    setMatchedWine(null);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.container}>
        <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>Scan Wine Label</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={24} color={theme.textSecondary} />
          </TouchableOpacity>
        </View>

        {phase === "camera" || phase === "analyzing" ? (
          <View style={styles.cameraContainer}>
            {capturedImage ? (
              <Image source={{ uri: capturedImage }} style={styles.camera} />
            ) : (
              <CameraView style={styles.camera} ref={cameraRef}>
                <View style={styles.cameraOverlay}>
                  <View style={styles.scanTarget} />
                  <Text style={styles.scanInstruction}>Center wine label in frame</Text>
                </View>
              </CameraView>
            )}

            {phase === "analyzing" ? (
              <View style={styles.analyzingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.analyzingText}>Identifying wine...</Text>
              </View>
            ) : (
              <View style={styles.cameraControls}>
                <TouchableOpacity style={[styles.captureBtn, { backgroundColor: theme.primary }]} onPress={handleCapture}>
                  <Camera size={24} color="#fff" />
                  <Text style={styles.captureText}>Scan Label</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null}

        {phase === "no_match" || phase === "mismatch" ? (
          <View style={[styles.resultContainer, { backgroundColor: theme.background }]}>
            <AlertCircle size={64} color={theme.danger} />
            <Text style={[styles.resultTitle, { color: theme.text }]}>
              {phase === "mismatch" ? "Wine Mismatch" : "No Match Found"}
            </Text>
            <Text style={[styles.resultSub, { color: theme.textSecondary }]}>
              {phase === "mismatch"
                ? `The label doesn't match "${masterWineName}".`
                : "The scanned label didn't strongly match any wine in the database."}
            </Text>

            <View style={[styles.aiDataCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.aiDataLabel, { color: theme.textSecondary }]}>What the AI saw:</Text>
              <Text style={[styles.aiDataValue, { color: theme.text }]}>
                Wine: {lastAiResult?.wineName || "Unknown"}
              </Text>
              <Text style={[styles.aiDataValue, { color: theme.text }]}>
                Producer: {lastAiResult?.producerName || lastAiResult?.producer || "Unknown"}
              </Text>
              <Text style={[styles.aiDataValue, { color: theme.text }]}>
                Vintage: {lastAiResult?.vintage || "Unknown"}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme.primary }]}
                onPress={handleReset}
              >
                <RefreshCw size={20} color="#fff" />
                <Text style={styles.actionBtnText}>Try Again</Text>
              </TouchableOpacity>

              {phase === "mismatch" && masterWineId && (
                <TouchableOpacity
                  style={[styles.actionBtnOutline, { borderColor: theme.border }]}
                  onPress={() => fetchBottlesForWine(masterWineId)}
                >
                  <Text style={[styles.actionBtnOutlineText, { color: theme.text }]}>
                    Continue Anyway
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}

        {phase === "bottle_picker" && (
          <BottlePickerModal
            visible={true}
            onClose={onClose}
            onBottleSelected={(id) => {
              onBottleSelected(id);
              onClose();
            }}
            bottles={bottlesList}
            title={`Select Storage Unit`}
            theme={theme}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanTarget: {
    width: 250,
    height: 350,
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  scanInstruction: {
    color: "#fff",
    marginTop: 24,
    fontSize: 16,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cameraControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 32,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
  },
  captureText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  analyzingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  analyzingText: {
    color: "#fff",
    marginTop: 16,
    fontSize: 16,
    fontWeight: "700",
  },
  resultContainer: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: "800",
    marginTop: 24,
    marginBottom: 8,
  },
  resultSub: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
  },
  aiDataCard: {
    width: "100%",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 32,
  },
  aiDataLabel: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  aiDataValue: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  actionBtnOutline: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionBtnOutlineText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
