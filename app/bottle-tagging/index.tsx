import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { InventoryBottle, MasterWine } from "@/types";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  query,
  where
} from "firebase/firestore";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Minus,
  Plus,
  Search,
  X
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

const NEXT_JS_API_URL = "https://caveauone.vercel.app";

type Phase = "search" | "confirm" | "verify" | "success" | "no_match";

// ─── Wine Matching Helpers ───────────────────────────────────────────────────
function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(chateau|château|domaine|maison|estate|winery|cellars?|vinery)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0
    )
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarityScore(a: string, b: string): number {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

export default function BottleTaggingScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [phase, setPhase] = useState<Phase>("search");
  const [loading, setLoading] = useState(false);
  const [masterWines, setMasterWines] = useState<MasterWine[]>([]);

  // Phase 1: Search
  const [searchQuery, setSearchQuery] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lastAiResult, setLastAiResult] = useState<any>(null);
  const cameraRef = useRef<CameraView>(null);

  // Phase 2: Confirm
  const [selectedWine, setSelectedWine] = useState<MasterWine | null>(null);
  const [untaggedBottles, setUntaggedBottles] = useState<InventoryBottle[]>([]);
  const [qtyToTag, setQtyToTag] = useState(1);

  // Phase 3: Verify
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(new Set());
  const [lastScanError, setLastScanError] = useState<string | null>(null);
  const lastBulkScanTime = useRef<number>(0);

  useEffect(() => {
    fetchMasterWines();
  }, []);

  const fetchMasterWines = async () => {
    try {
      // 1. Get all bottles that are "received" (untagged)
      const untaggedQ = query(collection(db, "inventory_bottles"), where("status", "==", "received"));
      const untaggedSnap = await getDocs(untaggedQ);

      // 2. Extract unique master wine IDs
      const untaggedWineIds = new Set(
        untaggedSnap.docs.map((d) => d.data().masterWineRef?.id).filter(Boolean)
      );

      // 3. Fetch master wines and filter
      const snap = await getDocs(collection(db, "master_wines"));
      const wines = snap.docs
        .filter((doc) => untaggedWineIds.has(doc.id))
        .map((doc) => ({ id: doc.id, ...doc.data() } as MasterWine));

      setMasterWines(wines);
    } catch (err) {
      console.error("Error fetching master wines", err);
    }
  };

  const handleAIScan = async () => {
    if (!cameraRef.current || isProcessingAI) return;
    setIsProcessingAI(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });

      if (!photo?.uri || !photo?.base64)
        throw new Error("Failed to capture photo");

      setCapturedImage(photo.uri);

      const response = await fetch(`${NEXT_JS_API_URL}/api/analyze-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: photo.base64 }),
      });

      if (!response.ok) throw new Error("AI Analysis failed");

      const aiResult = await response.json();
      console.log("AI Result:", aiResult);

      // Find best match in master wines
      let bestMatch = null;
      let highestScore = 0;

      for (const wine of masterWines) {
        const wineName = wine?.name || "";
        const score = similarityScore(wineName, aiResult.wineName || "");
        if (score > highestScore) {
          highestScore = score;
          bestMatch = wine;
        }
      }

      if (bestMatch && highestScore > 0.5) {
        handleSelectWine(bestMatch);
        setIsCameraActive(false);
        setCapturedImage(null);
      } else {
        setLastAiResult(aiResult);
        setPhase("no_match");
        setCapturedImage(null);
      }
    } catch (err) {
      console.error(err);
      alert("Error analyzing label.");
      setCapturedImage(null);
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleSelectWine = async (wine: MasterWine) => {
    setLoading(true);
    setSelectedWine(wine);
    try {
      // Find untagged bottles: status === "received" for this masterWine
      const q = query(
        collection(db, "inventory_bottles"),
        where("masterWineRef", "==", doc(db, "master_wines", wine.id)),
        where("status", "==", "received")
      );
      const snap = await getDocs(q);
      const bottles = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as InventoryBottle)
      );
      setUntaggedBottles(bottles);
      setQtyToTag(bottles.length > 0 ? 1 : 0);
      setPhase("confirm");
    } catch (err) {
      console.error(err);
      alert("Error fetching bottles.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmQty = () => {
    if (qtyToTag > 0) {
      setVerifiedIds(new Set());
      setPhase("verify");
    }
  };

  const handleVerifyQRScan = async ({ data }: { data: string }) => {
    if (phase !== "verify" || isProcessingAI) return;

    // Debounce rapid re-fires
    const now = Date.now();
    if (now - lastBulkScanTime.current < 2000) return;

    if (verifiedIds.has(data)) return;

    // Check if the scanned bottle is in the list of untagged bottles
    const bottleIdx = untaggedBottles.findIndex((b) => b.id === data);
    if (bottleIdx === -1) {
      lastBulkScanTime.current = now;
      setLastScanError(`QR Code ${data.slice(0, 8)}... is not an untagged bottle for this wine.`);
      setTimeout(() => setLastScanError(null), 3000);
      return;
    }

    lastBulkScanTime.current = now;
    setIsProcessingAI(true);

    try {
      const nextVerified = new Set(verifiedIds).add(data);
      setVerifiedIds(nextVerified);

      if (nextVerified.size >= qtyToTag) {
        setPhase("success");
      }
    } catch (err: any) {
      console.error(err);
      alert("Error updating bottle: " + err.message);
    } finally {
      setIsProcessingAI(false);
    }
  };

  const filteredWines = masterWines
    .filter(
      (w) =>
        w.name?.toLowerCase()?.includes(searchQuery.toLowerCase()) ||
        w.sku?.toLowerCase()?.includes(searchQuery.toLowerCase())
    )
    .slice(0, 10);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (phase === "search") {
              if (isCameraActive) {
                setIsCameraActive(false);
                setCapturedImage(null);
              }
              else router.back();
            } else if (phase === "confirm") {
              setPhase("search");
            } else if (phase === "no_match") {
              setPhase("search");
            } else if (phase === "success") {
              router.back();
            } else {
              setPhase("confirm");
            }
          }}
          style={styles.backButton}
        >
          <ChevronLeft size={28} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.title}>Tag Bottles</Text>
      </View>

      {phase === "search" && (
        <View style={styles.content}>
          {isCameraActive ? (
            <View style={styles.cameraContainer}>
              {capturedImage ? (
                <Image
                  source={{ uri: capturedImage }}
                  style={styles.camera}
                />
              ) : (
                <CameraView style={styles.camera} ref={cameraRef}>
                  <View style={styles.cameraOverlay}>
                    <View style={styles.scanTarget} />
                    <Text style={styles.scanInstruction}>
                      Center wine label in frame
                    </Text>
                  </View>
                </CameraView>
              )}
              <View style={styles.cameraControls}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={handleAIScan}
                  disabled={isProcessingAI}
                >
                  {isProcessingAI ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Camera size={24} color="#fff" />
                  )}
                  <Text style={styles.captureText}>
                    {isProcessingAI ? "Analyzing..." : "Scan Label"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.searchSection}>
              <TouchableOpacity
                style={styles.openScannerBtn}
                onPress={async () => {
                  const { status } = await requestPermission();
                  if (status === "granted") setIsCameraActive(true);
                  else alert("Camera permission required");
                }}
              >
                <Camera size={24} color="#fff" />
                <Text style={styles.openScannerText}>Scan Wine Label</Text>
              </TouchableOpacity>
              <Text style={styles.orText}>- OR -</Text>
              <View style={styles.searchInputContainer}>
                <Search size={20} color="#64748b" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by wine name or SKU..."
                  placeholderTextColor="#64748b"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={20} color="#64748b" />
                  </TouchableOpacity>
                )}
              </View>
              <FlatList
                data={filteredWines}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ gap: 12, paddingVertical: 12 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.wineCard}
                    onPress={() => handleSelectWine(item)}
                  >
                    <View style={styles.wineHeader}>
                      <Text style={styles.wineName}>{item.name}</Text>
                      <View style={styles.wineBadge}>
                        <Text style={styles.wineVintage}>{item.vintage}</Text>
                      </View>
                    </View>
                    <Text style={styles.wineMeta}>
                      SKU: {item.sku} • {item.format || "75cl"}
                    </Text>
                    <Text style={styles.wineProducer}>{item.producer}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      )}

      {phase === "confirm" && selectedWine && (
        <View style={styles.content}>
          <View style={styles.wineCard}>
            <View style={styles.wineHeader}>
              <Text style={styles.wineName}>{selectedWine.name}</Text>
              <View style={styles.wineBadge}>
                <Text style={styles.wineVintage}>{selectedWine.vintage}</Text>
              </View>
            </View>
            <Text style={styles.wineProducer}>{selectedWine.producer}</Text>

            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" }}>
              {selectedWine.sku && <Text style={styles.wineMeta}>SKU: {selectedWine.sku}</Text>}
              {selectedWine.format && <Text style={styles.wineMeta}>Format: {selectedWine.format}</Text>}
              {selectedWine.region && <Text style={styles.wineMeta}>Region: {selectedWine.region}</Text>}
              {selectedWine.type && <Text style={styles.wineMeta}>Type: {selectedWine.type}</Text>}
              {selectedWine.grapeVariety && <Text style={styles.wineMeta}>Grape: {selectedWine.grapeVariety}</Text>}
            </View>
          </View>

          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>Untagged Bottles</Text>
            <Text style={styles.statsBigValue}>{untaggedBottles.length}</Text>
            <Text style={styles.statsSub}>Status: Received</Text>
          </View>

          {untaggedBottles.length > 0 ? (
            <View style={styles.qtySection}>
              <Text style={styles.qtyLabel}>How many to tag now?</Text>
              <View style={styles.qtyControls}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => setQtyToTag(Math.max(1, qtyToTag - 1))}
                >
                  <Minus size={24} color="#fff" />
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyValue}
                  value={qtyToTag > 0 ? String(qtyToTag) : ""}
                  keyboardType="number-pad"
                  onChangeText={(val) => {
                    if (val === "") {
                      setQtyToTag(0);
                    } else {
                      const parsed = parseInt(val.replace(/[^0-9]/g, ""), 10);
                      if (!isNaN(parsed)) {
                        setQtyToTag(Math.min(untaggedBottles.length, parsed));
                      }
                    }
                  }}
                  onBlur={() => {
                    if (qtyToTag < 1) setQtyToTag(1);
                  }}
                />
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() =>
                    setQtyToTag(Math.min(untaggedBottles.length, qtyToTag + 1))
                  }
                >
                  <Plus size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleConfirmQty}
              >
                <Text style={styles.primaryButtonText}>Start Verification</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <CheckCircle2 size={48} color="#10b981" />
              <Text style={styles.emptyText}>All bottles are verified!</Text>
            </View>
          )}
        </View>
      )}

      {phase === "verify" && (
        <View style={styles.verifyContainer}>
          <CameraView
            style={styles.smallCamera}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={handleVerifyQRScan}
          >
            <View style={styles.smallCameraOverlay}>
              <View style={styles.smallScanTarget} />
              <Text style={styles.scanInstruction}>Scan QR Code</Text>
            </View>
          </CameraView>

          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>Verification Progress</Text>
            <Text style={styles.progressCount}>
              {verifiedIds.size} / {qtyToTag} Verified
            </Text>
          </View>

          {lastScanError && (
            <View style={styles.errorBanner}>
              <AlertCircle size={16} color="#ef4444" />
              <Text style={styles.errorText}>{lastScanError}</Text>
            </View>
          )}

          <ScrollView style={styles.bottleList}>
            {untaggedBottles.slice(0, qtyToTag).map((bottle, idx) => {
              const isVerified = verifiedIds.has(bottle.id);
              // If it's not verified but previous are verified, it's the "current" one
              const isCurrent = verifiedIds.size === idx;

              return (
                <View
                  key={bottle.id}
                  style={[
                    styles.bottleRow,
                    isVerified && styles.bottleRowVerified,
                    isCurrent && styles.bottleRowCurrent,
                  ]}
                >
                  <View style={styles.bottleRowLeft}>
                    <Text style={styles.bottleLabel}>
                      {bottle?.id}
                    </Text>
                    {isVerified && (
                      <Text style={styles.bottleIdScanned}>
                        {bottle.id.slice(0, 8).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View>
                    {isVerified ? (
                      <View style={styles.verifiedBadge}>
                        <CheckCircle2 size={16} color="#10b981" />
                        <Text style={styles.verifiedText}>Verified</Text>
                      </View>
                    ) : isCurrent ? (
                      <View style={styles.waitingBadge}>
                        <ActivityIndicator size="small" color="#4f46e5" />
                        <Text style={styles.waitingText}>Waiting for Scan</Text>
                      </View>
                    ) : (
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>Pending</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {phase === "success" && (
        <View style={styles.successContainer}>
          <CheckCircle2 size={80} color="#10b981" />
          <Text style={styles.successTitle}>Successfully Verified!</Text>
          <Text style={styles.successSub}>
            {qtyToTag} bottles of <Text style={{color: "#fff", fontWeight: "bold"}}>{selectedWine?.name}</Text> have been verified.
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              setPhase("search");
              setSearchQuery("");
            }}
          >
            <Text style={styles.primaryButtonText}>Verify Another Wine</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: "#10b981", marginTop: 12 }]}
            onPress={() => {
              const idsString = Array.from(verifiedIds).join(",");
              router.push({
                pathname: "/tagging",
                params: { 
                  bottleIds: idsString,
                  wineName: selectedWine?.name,
                  wineVintage: selectedWine?.vintage,
                  wineProducer: selectedWine?.producer,
                  wineFormat: selectedWine?.format
                }
              });
            }}
          >
            <Text style={styles.primaryButtonText}>Tag Location Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: "#334155", marginTop: 12 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonText}>Return to Home</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "no_match" && lastAiResult && (
        <View style={styles.successContainer}>
          <AlertCircle size={80} color="#fbbf24" />
          <Text style={styles.successTitle}>No Match Found</Text>
          <Text style={[styles.successSub, { marginBottom: 24 }]}>
            The scanned label didn't strongly match any wine in the database.
          </Text>

          <View style={[styles.wineCard, { width: "100%", marginBottom: 32 }]}>
            <Text style={styles.statsLabel}>What the AI saw:</Text>
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#334155" }}>
              <Text style={styles.wineMeta}>Wine: <Text style={{ color: "#fff" }}>{lastAiResult.wineName || "Unknown"}</Text></Text>
              <Text style={styles.wineMeta}>Producer: <Text style={{ color: "#fff" }}>{lastAiResult.producerName || lastAiResult.producer || "Unknown"}</Text></Text>
              <Text style={styles.wineMeta}>Vintage: <Text style={{ color: "#fff" }}>{lastAiResult.vintage || "Unknown"}</Text></Text>
              <Text style={styles.wineMeta}>Format: <Text style={{ color: "#fff" }}>{lastAiResult.bottleSize || "Unknown"}</Text></Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              setPhase("search");
              setIsCameraActive(true);
            }}
          >
            <Text style={styles.primaryButtonText}>Scan Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: "#334155", marginTop: 12 }]}
            onPress={() => {
              setPhase("search");
              setIsCameraActive(false);
            }}
          >
            <Text style={styles.primaryButtonText}>Search Manually</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4f46e5" />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    paddingBottom: 20,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#fff",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  searchSection: {
    flex: 1,
  },
  openScannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f46e5",
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  openScannerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  orText: {
    color: "#475569",
    textAlign: "center",
    marginVertical: 16,
    fontWeight: "700",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    marginLeft: 10,
  },
  wineCard: {
    backgroundColor: "#1e293b",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },
  wineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  wineName: {
    color: "#f1f5f9",
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  wineBadge: {
    backgroundColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 12,
  },
  wineVintage: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
  },
  wineMeta: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  wineProducer: {
    color: "#64748b",
    fontSize: 13,
    fontStyle: "italic",
  },
  statsCard: {
    backgroundColor: "#1e293b",
    padding: 24,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 24,
  },
  statsLabel: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statsBigValue: {
    color: "#fff",
    fontSize: 64,
    fontWeight: "900",
    marginVertical: 8,
  },
  statsSub: {
    color: "#fbbf24",
    fontSize: 14,
    fontWeight: "800",
  },
  qtySection: {
    alignItems: "center",
  },
  qtyLabel: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    marginBottom: 32,
  },
  qtyBtn: {
    backgroundColor: "#334155",
    padding: 16,
    borderRadius: 16,
  },
  qtyValue: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    minWidth: 50,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#4f46e5",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: "100%",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  emptyState: {
    alignItems: "center",
    marginTop: 40,
    gap: 16,
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "700",
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: 250,
    height: 350,
    borderWidth: 2,
    borderColor: "#4f46e5",
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  scanInstruction: {
    color: "#fff",
    marginTop: 24,
    fontSize: 16,
    fontWeight: "700",
  },
  cameraControls: {
    padding: 24,
    backgroundColor: "#000",
    alignItems: "center",
  },
  captureButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4f46e5",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    gap: 12,
    width: "100%",
  },
  captureText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  verifyContainer: {
    flex: 1,
  },
  smallCamera: {
    height: 250,
    width: "100%",
  },
  smallCameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  smallScanTarget: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: "#10b981",
    borderRadius: 24,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#1e293b",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  progressTitle: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  progressCount: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    padding: 12,
    paddingHorizontal: 20,
    gap: 10,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  bottleList: {
    flex: 1,
    padding: 20,
  },
  bottleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1e293b",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  bottleRowCurrent: {
    borderColor: "#4f46e5",
    backgroundColor: "rgba(79, 70, 229, 0.1)",
  },
  bottleRowVerified: {
    borderColor: "#10b981",
    backgroundColor: "rgba(16, 185, 129, 0.05)",
  },
  bottleRowLeft: {
    flex: 1,
  },
  bottleLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  bottleIdScanned: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  pendingBadge: {
    backgroundColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pendingText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
  },
  waitingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(79, 70, 229, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  waitingText: {
    color: "#818cf8",
    fontSize: 12,
    fontWeight: "800",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  verifiedText: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "800",
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 24,
    marginBottom: 8,
  },
  successSub: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 40,
  },
});
