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
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  MapPin,
  Minus,
  Plus,
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { OnboardingItem, OnboardingTask } from "../../types";

const NEXT_JS_API_URL = "https://caveauone.vercel.app";
const { width } = Dimensions.get("window");

// ─── Wine Matching Logic ─────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(chateau|château|domaine|maison|estate|winery|cellars?|vinery)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVintage(v: string | number | undefined): string {
  if (!v) return "";
  const match = String(v).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

// Normalize bottle formats to a common unit (ml as number)
// Handles both "75cl"/"150cl" (your UI) and "750ml"/"1.5L" (AI output)
function normalizeFormatToMl(f: string | undefined): number {
  if (!f) return 750;
  const lower = f.toLowerCase().replace(/\s/g, "");
  if (lower === "magnum") return 1500;
  if (lower === "half" || lower === "halfbottle") return 375;
  if (lower === "jeroboam") return 3000;
  if (lower === "rehoboam") return 4500;
  if (lower === "methuselah" || lower === "imperial") return 6000;
  // e.g. "75cl", "37.5cl", "150cl", "300cl"
  const clMatch = lower.match(/^(\d+\.?\d*)cl$/);
  if (clMatch) return Math.round(parseFloat(clMatch[1]) * 10);
  // e.g. "750ml", "375ml", "1500ml"
  const mlMatch = lower.match(/^(\d+)ml$/);
  if (mlMatch) return parseInt(mlMatch[1]);
  // e.g. "1.5l", "3l"
  const literMatch = lower.match(/^(\d+\.?\d*)l$/);
  if (literMatch) return Math.round(parseFloat(literMatch[1]) * 1000);
  return 750; // default
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(
    normalizeStr(a)
      .split(" ")
      .filter((t) => t.length > 2),
  );
  const tokensB = new Set(
    normalizeStr(b)
      .split(" ")
      .filter((t) => t.length > 2),
  );
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap++;
  }
  return overlap / new Set([...tokensA, ...tokensB]).size;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
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

type AiLabelResult = {
  wineName: string;
  vintage?: string | number;
  producer?: string;
  producerName?: string;
  bottleSize?: string;
  confidence?: string;
};

type MatchResult = {
  item: OnboardingItem;
  score: number;
  breakdown: Record<string, number>;
};

const MATCH_THRESHOLD = 0.52;
const WEIGHTS = { wineName: 0.45, vintage: 0.25, format: 0.15, producer: 0.15 };
const WEIGHTS_WITH_FORMAT = {
  wineName: 0.4,
  vintage: 0.1,
  format: 0.4,
  producer: 0.1,
};

function scoreMatch(
  item: OnboardingItem,
  ai: AiLabelResult,
  selectedFormat: string | null,
): MatchResult {
  const breakdown: Record<string, number> = {};

  // Wine name: blend token overlap + fuzzy similarity
  const tokenScore = tokenOverlapScore(item.wineName, ai.wineName);
  const fuzzyScore = similarityScore(item.wineName, ai.wineName);
  breakdown.wineName = tokenScore * 0.6 + fuzzyScore * 0.4;

  // Vintage
  const itemVintage = normalizeVintage(item.vintage);
  const aiVintage = normalizeVintage(ai.vintage);
  if (!itemVintage || !aiVintage) {
    breakdown.vintage = 0.5; // unknown — neutral
  } else if (itemVintage === aiVintage) {
    breakdown.vintage = 1.0;
  } else {
    const diff = Math.abs(Number(itemVintage) - Number(aiVintage));
    breakdown.vintage = diff === 1 ? 0.3 : 0; // 1-yr OCR typo gets partial credit
  }

  // Format — normalize both sides to ml for reliable comparison
  const itemMl = normalizeFormatToMl(item.format);
  if (selectedFormat) {
    // User has specified the format. This is a strong signal.
    // Compare the item's format directly with the user-selected format.
    const selectedMl = normalizeFormatToMl(selectedFormat);
    breakdown.format = itemMl === selectedMl ? 1.0 : 0.0;
  } else {
    // User has not specified a format. Rely on AI detection vs item format.
    const aiMl = normalizeFormatToMl(ai.bottleSize);
    breakdown.format = itemMl === aiMl ? 1.0 : 0.0;
  }

  // Producer: compare AI-extracted producer against the item's actual producer field.
  // Also check if the producer name appears inside the wine name as a secondary signal.
  const producerStr = ai.producerName ?? ai.producer ?? "";
  if (!producerStr) {
    // AI returned no producer — neutral signal
    breakdown.producer = 0.5;
  } else if (!item.producerName) {
    // Item has no producer on file — fall back to checking the wine name
    breakdown.producer = tokenOverlapScore(item.wineName, producerStr) * 0.5;
  } else {
    // Compare directly against the stored producer name
    const directMatch = similarityScore(item.producerName, producerStr);
    const nameOverlap = tokenOverlapScore(item.wineName, producerStr);
    breakdown.producer = Math.max(directMatch, nameOverlap * 0.6);
  }

  const weights = selectedFormat ? WEIGHTS_WITH_FORMAT : WEIGHTS;
  const score =
    breakdown.wineName * weights.wineName +
    breakdown.vintage * weights.vintage +
    breakdown.format * weights.format +
    breakdown.producer * weights.producer;
  return { item, score, breakdown };
}

function findBestMatch(
  taskItems: OnboardingItem[],
  ai: AiLabelResult,
  selectedFormat: string | null,
): {
  match: OnboardingItem | null;
  score: number;
  breakdown: Record<string, number>;
} {
  // Only consider items that still need bottles onboarded
  const candidates = taskItems.filter((i) => i.onboardedQty < i.qty);
  if (candidates.length === 0) return { match: null, score: 0, breakdown: {} };

  const scored: MatchResult[] = candidates
    .map((item) => scoreMatch(item, ai, selectedFormat))
    .sort((a, b) => b.score - a.score);

  // Log scoring table to help tune the threshold during development
  console.table(
    scored.map((r) => ({
      wine: r.item.wineName,
      score: r.score.toFixed(3),
      wineName: r.breakdown.wineName?.toFixed(2),
      vintage: r.breakdown.vintage?.toFixed(2),
      format: r.breakdown.format?.toFixed(2),
      producer: r.breakdown.producer?.toFixed(2),
    })),
  );

  const best = scored[0];
  if (best.score < MATCH_THRESHOLD) {
    console.warn(
      `Best match "${best.item.wineName}" scored ${best.score.toFixed(3)} — below threshold ${MATCH_THRESHOLD}`,
    );
    return { match: null, score: best.score, breakdown: best.breakdown };
  }

  return { match: best.item, score: best.score, breakdown: best.breakdown };
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Step =
  | "overview"
  | "scan_label"
  | "verify_qr"
  | "confirm_qty"
  | "bulk_verify"
  | "success"
  | "no_match"
  | "manual_select"
  | "select_item_for_report"
  | "select_bottle_for_report";

// ─── Component ───────────────────────────────────────────────────────────────

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
  // Store the verified bottle ID separately so success screen always shows the right one
  const [verifiedBottleId, setVerifiedBottleId] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const lastMismatchAlert = useRef<number>(0);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [sizeConfirmed, setSizeConfirmed] = useState(false);
  // Keep AI result for "no match" screen so user can see what was detected
  const [lastAiResult, setLastAiResult] = useState<AiLabelResult | null>(null);
  const [lastMatchScore, setLastMatchScore] = useState<number>(0);

  // Batch onboarding state
  const [batchQty, setBatchQty] = useState(1);
  const [batchBottleIds, setBatchBottleIds] = useState<string[]>([]);
  const [verifiedBottleIdsSet, setVerifiedBottleIdsSet] = useState<Set<string>>(
    new Set(),
  );
  const [issuedBottleIdsSet, setIssuedBottleIdsSet] = useState<Set<string>>(
    new Set(),
  );
  const lastBulkScanTime = useRef<number>(0);

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
    if (openScanner === "true") setCurrentStep("scan_label");
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

      if (!photo?.uri || !photo?.base64)
        throw new Error("Failed to capture photo");

      setCapturedImage(photo.uri);

      const response = await fetch(`${NEXT_JS_API_URL}/api/analyze-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: photo.base64 }),
      });

      if (!response.ok) throw new Error("AI Analysis failed");

      const aiResult: AiLabelResult = await response.json();
      console.log("AI Scanned Label:", aiResult);

      setLastAiResult(aiResult);

      // Use scored matching instead of brittle string includes
      const { match, score, breakdown } = findBestMatch(
        task?.items ?? [],
        aiResult,
        selectedFormat,
      );

      setLastMatchScore(score);

      if (match) {
        setActiveItem(match);
        setSizeConfirmed(match.format === "75cl");
        setBatchQty(1);
        setCurrentStep("confirm_qty");
        setCapturedImage(null);
      } else {
        // Show no-match screen with AI result so user can decide next step
        setCapturedImage(null);
        setCurrentStep("no_match");
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
      // Capture the bottle ID before incrementing onboardedQty
      const bottleId = activeItem.bottleIds[activeItem.onboardedQty];
      setVerifiedBottleId(bottleId);

      const bottleRef = doc(db, "inventory_bottles", scannedData);
      const storeRef = doc(db, "stores", profile.locationId);

      await updateDoc(bottleRef, {
        status: "received",
        updatedAt: serverTimestamp(),
        storeRef: storeRef,
      });

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

  const handleConfirmBatchQty = () => {
    if (!activeItem) return;
    const start = activeItem.onboardedQty;
    const ids = activeItem.bottleIds.slice(start, start + batchQty);
    setBatchBottleIds(ids);
    setVerifiedBottleIdsSet(new Set());
    setIssuedBottleIdsSet(new Set());
    setCurrentStep("bulk_verify");
  };

  const handleBulkQRScan = async ({ data }: { data: string }) => {
    if (!activeItem || !task || !profile?.locationId) return;
    // Debounce rapid re-fires
    const now = Date.now();
    if (now - lastBulkScanTime.current < 2000) return;
    if (verifiedBottleIdsSet.has(data) || issuedBottleIdsSet.has(data)) return;
    if (!batchBottleIds.includes(data)) {
      lastBulkScanTime.current = now;
      alert("This QR code is not in the current batch.");
      return;
    }
    lastBulkScanTime.current = now;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "inventory_bottles", data), {
        status: "received",
        updatedAt: serverTimestamp(),
        storeRef: doc(db, "stores", profile.locationId),
      });

      const nextVerified = new Set(verifiedBottleIdsSet).add(data);
      setVerifiedBottleIdsSet(nextVerified);
      setVerifiedBottleId(data); // keep single ref for legacy success screen

      const totalDone = nextVerified.size + issuedBottleIdsSet.size;
      if (totalDone === batchBottleIds.length) {
        // Update task progress
        const updatedItems = task.items.map((i) => {
          if (i.id === activeItem.id) {
            return {
              ...i,
              onboardedQty: i.onboardedQty + batchBottleIds.length,
            };
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
      }
    } catch (err: any) {
      console.error(err);
      alert("Error updating bottle: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkIssue = async (bottleId: string) => {
    if (!activeItem || !task || !profile) return;
    Alert.alert(
      "Report Issue",
      `What's wrong with bottle ${bottleId.slice(-8)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "QR Label Missing",
          onPress: () => _markBulkIssue(bottleId, "missing_qr_label"),
        },
        {
          text: "Bottle Missing",
          onPress: () => _markBulkIssue(bottleId, "missing_bottle"),
        },
      ],
    );
  };

  const _markBulkIssue = async (
    bottleId: string,
    reason: "missing_bottle" | "missing_qr_label",
  ) => {
    if (!activeItem || !task || !profile) return;
    setIsProcessing(true);
    try {
      const nextIssued = new Set(issuedBottleIdsSet).add(bottleId);
      setIssuedBottleIdsSet(nextIssued);

      const newReport = {
        itemId: activeItem.id,
        wineName: activeItem.wineName,
        sku: activeItem.sku,
        reportedBy: profile.email,
        reportedAt: Timestamp.now(),
        reason,
        bottleId,
      };

      const totalDone = verifiedBottleIdsSet.size + nextIssued.size;
      if (totalDone === batchBottleIds.length) {
        const updatedItems = task.items.map((i) => {
          if (i.id === activeItem.id) {
            return {
              ...i,
              onboardedQty: i.onboardedQty + batchBottleIds.length,
              issues: [...(i.issues || []), bottleId],
            };
          }
          return i;
        });
        const isFullyDone = updatedItems.every((i) => i.onboardedQty === i.qty);
        await updateDoc(doc(db, "onboarding_tasks", task.id), {
          items: updatedItems,
          reports: [...(task.reports || []), newReport],
          status: isFullyDone ? "completed" : "warehouse",
          updatedAt: serverTimestamp(),
        });
        setCurrentStep("success");
      } else {
        await updateDoc(doc(db, "onboarding_tasks", task.id), {
          reports: [...(task.reports || []), newReport],
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err: any) {
      console.error(err);
      alert("Error reporting issue: " + err.message);
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
        reason,
        bottleId,
      };

      const updatedItems = task.items.map((i) => {
        if (i.id !== item.id) return i;
        const newBottleIds = [...i.bottleIds];
        const reportedBottleIndex = newBottleIds.indexOf(bottleId);
        const nextOnboardIndex = i.onboardedQty;
        if (
          reportedBottleIndex !== -1 &&
          reportedBottleIndex !== nextOnboardIndex
        ) {
          const temp = newBottleIds[nextOnboardIndex];
          newBottleIds[nextOnboardIndex] = newBottleIds[reportedBottleIndex];
          newBottleIds[reportedBottleIndex] = temp;
        }
        return {
          ...i,
          onboardedQty: i.onboardedQty + 1,
          bottleIds: newBottleIds,
          issues: [...(i.issues || []), bottleId],
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

  const handleResolveIssue = async (itemId: string, bottleId: string) => {
    if (!task) return;

    Alert.alert(
      "Reset Issue",
      `Are you sure you want to reset the issue for bottle ${bottleId.slice(-8)}? This will allow it to be scanned again.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          onPress: async () => {
            setIsProcessing(true);
            try {
              const updatedItems = task.items.map((i) => {
                if (i.id === itemId) {
                  // 1. Remove from issues
                  const newIssues = i.issues?.filter((id) => id !== bottleId) || [];

                  // 2. Move bottleId back to the 'pending' section by swapping it with the last 'processed' item
                  const newBottleIds = [...i.bottleIds];
                  const reportedIndex = newBottleIds.indexOf(bottleId);
                  const lastProcessedIndex = i.onboardedQty - 1;

                  if (reportedIndex !== -1 && reportedIndex < i.onboardedQty && lastProcessedIndex >= 0) {
                    const temp = newBottleIds[lastProcessedIndex];
                    newBottleIds[lastProcessedIndex] = newBottleIds[reportedIndex];
                    newBottleIds[reportedIndex] = temp;
                  }

                  return {
                    ...i,
                    issues: newIssues,
                    bottleIds: newBottleIds,
                    // Decrement onboardedQty so it can be scanned again
                    onboardedQty: Math.max(0, i.onboardedQty - 1),
                  };
                }
                return i;
              });

              const updatedReports =
                task.reports?.filter(
                  (r) => !(r.itemId === itemId && r.bottleId === bottleId),
                ) || [];

              const isFullyDone = updatedItems.every(
                (i) => i.onboardedQty === i.qty && (!i.issues || i.issues.length === 0),
              );

              await updateDoc(doc(db, "onboarding_tasks", task.id), {
                items: updatedItems,
                reports: updatedReports,
                status: isFullyDone ? "completed" : "warehouse",
                updatedAt: serverTimestamp(),
              });
            } catch (err: any) {
              console.error(err);
              alert("Error resetting issue: " + err.message);
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </View>
    );
  }

  if (!task) return null;

  const isTaskComplete = task.items.every(
    (item) => item.onboardedQty >= item.qty,
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (currentStep === "overview") {
              router.back();
            } else if (isTaskComplete) {
              router.dismissTo("/onboarding");
            } else {
              setCurrentStep("overview");
            }
          }}
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

      {/* OVERVIEW */}
      {currentStep === "overview" && (
        <View style={styles.content}>
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Progress Overview</Text>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${(task.items.reduce((s, i) => s + i.onboardedQty, 0) /
                      task.items.reduce((s, i) => s + i.qty, 0)) *
                      100
                      }%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.statsValue}>
              {task.items.reduce((s, i) => s + i.onboardedQty, 0)} /{" "}
              {task.items.reduce((s, i) => s + i.qty, 0)} Bottles Verified
            </Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Wine Items</Text>
            {task.items.length > 5 && (
              <Text style={{ color: "#94a3b8", fontSize: 12, fontStyle: "italic", marginRight: 4 }}>
                Scroll to see all
              </Text>
            )}
          </View>
          <ScrollView
            style={{ flex: 1, marginBottom: 16 }}
            showsVerticalScrollIndicator={true}
            indicatorStyle="white"
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {task.items.map((item) => {
              const successfullyOnboardedQty =
                item.onboardedQty - (item.issues?.length || 0);
              const hasIssues = (item.issues?.length || 0) > 0;
              const itemReports = task.reports?.filter(r => r.itemId === item.id) || [];
              const isItemComplete = item.onboardedQty === item.qty;
              let iconColor = "#4f46e5";
              if (isItemComplete) iconColor = hasIssues ? "#ef4444" : "#10b981";

              return (
                <View key={item.id} style={[styles.itemCard, { flexDirection: "column", padding: 0, overflow: "hidden" }]}>
                  {/* Main Item Row */}
                  <View style={{ flexDirection: "row", alignItems: "center", padding: 16, width: "100%" }}>
                    <View style={styles.itemIcon}>
                      <Wine size={24} color={iconColor} />
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
                      <Text style={[styles.qtyText, { color: iconColor }]}>
                        {successfullyOnboardedQty}/{item.qty}
                      </Text>
                      {isItemComplete ? (
                        hasIssues ? (
                          <AlertCircle size={16} color={iconColor} />
                        ) : (
                          <CheckCircle2 size={16} color={iconColor} />
                        )
                      ) : null}
                      {hasIssues && !isItemComplete && (
                        <Text style={styles.issuesText}>
                          ({item.issues?.length} issue{item.issues!.length > 1 ? "s" : ""})
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Detailed Issues List */}
                  {itemReports.length > 0 && (
                    <View style={{ backgroundColor: "rgba(239,68,68,0.05)", padding: 12, paddingHorizontal: 16, width: "100%", borderTopWidth: 1, borderTopColor: "rgba(239,68,68,0.1)" }}>
                      <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "800", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Reported Issues
                      </Text>
                      {itemReports.map((report, idx) => (
                        <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <AlertCircle size={14} color="#ef4444" />
                          <Text style={{ color: "#f87171", fontSize: 13, fontFamily: "monospace", fontWeight: "700" }}>
                            {report.bottleId.slice(-8)}
                          </Text>
                          <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "500", flex: 1 }} numberOfLines={1}>
                            — {report.reason === "missing_qr_label" ? "QR Label Missing" : "Physical Bottle Missing"}
                          </Text>
                          <TouchableOpacity
                            style={{ backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                            onPress={() => handleResolveIssue(item.id, report.bottleId)}
                          >
                            <Text style={{ color: "#10b981", fontSize: 11, fontWeight: "700", textTransform: "uppercase" }}>
                              Reset
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.mainButton}
            onPress={() => setCurrentStep("scan_label")}
          >
            <Camera size={24} color="#fff" />
            <Text style={styles.mainButtonText}>Scan Bottle Label</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reportIssueButton}
            onPress={() => setCurrentStep("select_item_for_report")}
          >
            <AlertCircle size={20} color="#ef4444" />
            <Text style={styles.reportIssueButtonText}>Report an Issue</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SELECT ITEM FOR REPORT */}
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
                  <Wine size={24} color="#4f46e5" />
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

      {/* SELECT BOTTLE FOR REPORT */}
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

      {/* SCAN LABEL */}
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

      {/* CONFIRM QTY */}
      {currentStep === "confirm_qty" && activeItem && (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* Wine confirmation card */}
          <View style={styles.matchCard}>
            <Text style={styles.matchLabel}>Bottle Recognized</Text>
            <Text style={styles.matchProducer}>{activeItem.producerName}</Text>
            <Text style={styles.matchName}>{activeItem.wineName}</Text>
            <View style={styles.matchMeta}>
              <Text style={styles.matchMetaText}>{activeItem.vintage}</Text>
              <View style={styles.metaDot} />
              <Text style={styles.matchMetaText}>{activeItem.format}</Text>
            </View>
          </View>

          {/* Non-75cl size confirmation (once for whole batch) */}
          {!sizeConfirmed && activeItem.format !== "75cl" && (
            <View style={styles.confirmFormatCard}>
              <Text style={styles.confirmFormatTitle}>Confirm Bottle Size</Text>
              <Text style={styles.confirmFormatDesc}>
                This label matched a{" "}
                <Text style={{ fontWeight: "900", color: "#f59e0b" }}>
                  {activeItem.format}
                </Text>{" "}
                bottle. Physically verify the size before proceeding.
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
          )}

          {sizeConfirmed && (
            <>
              {/* Quantity selector */}
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
                How many of this wine are you onboarding?
              </Text>
              <Text
                style={{
                  color: "#64748b",
                  fontSize: 13,
                  fontWeight: "600",
                  marginBottom: 16,
                }}
              >
                {activeItem.qty - activeItem.onboardedQty} bottle(s) remaining
                in this task
              </Text>

              {activeItem.qty - activeItem.onboardedQty <= 10 ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 32,
                  }}
                >
                  {Array.from(
                    {
                      length: activeItem.qty - activeItem.onboardedQty,
                    },
                    (_, i) => i + 1,
                  ).map((n) => (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setBatchQty(n)}
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 16,
                        borderWidth: 2,
                        borderColor: batchQty === n ? "#4f46e5" : "#334155",
                        backgroundColor: batchQty === n ? "#4f46e5" : "#1e293b",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: batchQty === n ? "#fff" : "#94a3b8",
                          fontSize: 22,
                          fontWeight: "900",
                        }}
                      >
                        {n}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 24, marginBottom: 32, alignSelf: "center" }}>
                  <TouchableOpacity
                    style={{ backgroundColor: "#334155", padding: 16, borderRadius: 16 }}
                    onPress={() => setBatchQty(Math.max(1, batchQty - 1))}
                  >
                    <Minus size={24} color="#fff" />
                  </TouchableOpacity>

                  <TextInput
                    style={{
                      color: "#fff",
                      fontSize: 32,
                      fontWeight: "900",
                      minWidth: 50,
                      textAlign: "center",
                    }}
                    value={batchQty > 0 ? String(batchQty) : ""}
                    keyboardType="number-pad"
                    onChangeText={(val) => {
                      if (val === "") {
                        setBatchQty(0);
                      } else {
                        const parsed = parseInt(val.replace(/[^0-9]/g, ""), 10);
                        if (!isNaN(parsed)) {
                          setBatchQty(Math.min(activeItem.qty - activeItem.onboardedQty, parsed));
                        }
                      }
                    }}
                    onBlur={() => {
                      if (batchQty < 1) setBatchQty(1);
                    }}
                  />

                  <TouchableOpacity
                    style={{ backgroundColor: "#334155", padding: 16, borderRadius: 16 }}
                    onPress={() => setBatchQty(Math.min(activeItem.qty - activeItem.onboardedQty, batchQty + 1))}
                  >
                    <Plus size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={styles.mainButton}
                onPress={handleConfirmBatchQty}
              >
                <QrCode size={24} color="#fff" />
                <Text style={styles.mainButtonText}>
                  Confirm & View {batchQty} Bottle{batchQty > 1 ? "s" : ""}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setCurrentStep("scan_label")}
              >
                <Text style={styles.secondaryButtonText}>Cancel & Rescan</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}

      {/* BULK VERIFY */}
      {currentStep === "bulk_verify" && activeItem && (
        <View style={{ flex: 1 }}>
          {/* Compact camera at top */}
          <View
            style={{
              height: 400,
              margin: 16,
              borderRadius: 24,
              overflow: "hidden",
              backgroundColor: "#000",
            }}
          >
            <CameraView
              style={{ flex: 1 }}
              onBarcodeScanned={handleBulkQRScan}
            />
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "rgba(0,0,0,0.35)",
              }}
            >
              <View
                style={{
                  width: 140,
                  height: 140,
                  borderWidth: 2,
                  borderColor: "#4f46e5",
                  borderRadius: 12,
                  backgroundColor: "transparent",
                }}
              />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 12,
                }}
              >
                Scan each QR label
              </Text>
            </View>
          </View>

          {/* Progress */}
          <View style={{ paddingHorizontal: 24, marginBottom: 12 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <View style={{ flex: 1, paddingRight: 16 }}>
                {activeItem.producerName && (
                  <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "700", marginBottom: 2 }}>
                    {activeItem.producerName}
                  </Text>
                )}
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900", marginBottom: 4 }}>
                  {activeItem.wineName}
                </Text>
                <Text style={{ color: "#64748b", fontSize: 12, fontWeight: "600" }}>
                  {[activeItem.vintage, activeItem.format].filter(Boolean).join(" • ")}
                </Text>
              </View>
              <Text
                style={{ color: "#4f46e5", fontSize: 14, fontWeight: "900" }}
              >
                {verifiedBottleIdsSet.size + issuedBottleIdsSet.size} /{" "}
                {batchBottleIds.length}
              </Text>
            </View>
            <View
              style={{ height: 6, backgroundColor: "#1e293b", borderRadius: 3 }}
            >
              <View
                style={{
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: "#10b981",
                  width: `${((verifiedBottleIdsSet.size + issuedBottleIdsSet.size) / batchBottleIds.length) * 100}%`,
                }}
              />
            </View>
          </View>

          {/* Bottle list */}
          <ScrollView
            style={{ flex: 1, paddingHorizontal: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {batchBottleIds.map((bottleId, index) => {
              const isVerified = verifiedBottleIdsSet.has(bottleId);
              const isIssued = issuedBottleIdsSet.has(bottleId);
              const isPending = !isVerified && !isIssued;
              return (
                <View
                  key={bottleId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isVerified
                      ? "rgba(16,185,129,0.08)"
                      : isIssued
                        ? "rgba(239,68,68,0.08)"
                        : "#1e293b",
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 10,
                    borderWidth: 1,
                    borderColor: isVerified
                      ? "rgba(16,185,129,0.3)"
                      : isIssued
                        ? "rgba(239,68,68,0.3)"
                        : "#334155",
                    gap: 14,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: isVerified
                        ? "rgba(16,185,129,0.15)"
                        : isIssued
                          ? "rgba(239,68,68,0.15)"
                          : "#0f172a",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isVerified ? (
                      <CheckCircle2 size={18} color="#10b981" />
                    ) : isIssued ? (
                      <AlertCircle size={18} color="#ef4444" />
                    ) : (
                      <Text
                        style={{
                          color: "#64748b",
                          fontSize: 13,
                          fontWeight: "900",
                        }}
                      >
                        {index + 1}
                      </Text>
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: "#94a3b8",
                        fontSize: 11,
                        fontWeight: "800",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Bottle {index + 1}
                    </Text>
                    <Text
                      style={{
                        color: isVerified
                          ? "#10b981"
                          : isIssued
                            ? "#ef4444"
                            : "#fff",
                        fontSize: 13,
                        fontWeight: "700",
                        fontFamily: "monospace",
                      }}
                    >
                      {bottleId.slice(-12)}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text
                      style={{
                        color: isVerified
                          ? "#10b981"
                          : isIssued
                            ? "#ef4444"
                            : "#64748b",
                        fontSize: 11,
                        fontWeight: "800",
                        textTransform: "uppercase",
                      }}
                    >
                      {isVerified
                        ? "✓ Verified"
                        : isIssued
                          ? "! Issue"
                          : "Pending"}
                    </Text>
                    {isPending && (
                      <TouchableOpacity
                        onPress={() => handleBulkIssue(bottleId)}
                      >
                        <Text
                          style={{
                            color: "#ef4444",
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          Report Issue
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      )}

      {/* VERIFY QR */}
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

      {/* NO MATCH */}
      {currentStep === "no_match" && (
        <View style={styles.noMatchContainer}>
          <View style={styles.noMatchIconCircle}>
            <AlertCircle size={56} color="#f59e0b" strokeWidth={2} />
          </View>
          <Text style={styles.noMatchTitle}>No Match Found</Text>
          <Text style={styles.noMatchDesc}>
            The AI detected a wine but it didn't match anything in this task
            with enough confidence.
          </Text>

          {lastAiResult && (
            <View style={styles.noMatchDetectedCard}>
              <Text style={styles.noMatchDetectedLabel}>What was detected</Text>
              <Text style={styles.noMatchDetectedWine}>
                {lastAiResult.producerName ??
                  lastAiResult.producer ??
                  "Unknown Producer"}
              </Text>
              <Text style={styles.noMatchDetectedName}>
                {lastAiResult.wineName ?? "Unknown Wine"}
              </Text>
              <View style={styles.noMatchMeta}>
                {lastAiResult.vintage ? (
                  <Text style={styles.metaBadge}>
                    {String(lastAiResult.vintage)}
                  </Text>
                ) : null}
                {lastAiResult.bottleSize ? (
                  <Text style={styles.metaBadge}>
                    {lastAiResult.bottleSize}
                  </Text>
                ) : null}
                <Text style={[styles.metaBadge, { color: "#f59e0b" }]}>
                  Score: {(lastMatchScore * 100).toFixed(0)}%
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.mainButton}
            onPress={() => setCurrentStep("scan_label")}
          >
            <Camera size={20} color="#fff" />
            <Text style={styles.mainButtonText}>Try Again</Text>
          </TouchableOpacity>

          {/* Manual override — let user pick the item themselves */}
          <TouchableOpacity
            style={styles.manualSelectButton}
            onPress={() => setCurrentStep("manual_select")} // ← was "select_item_for_report"
          >
            <Text style={styles.manualSelectButtonText}>
              Select Wine Manually
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {/* MANUAL SELECT */}
      {currentStep === "manual_select" && lastAiResult && (
        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>Select the correct wine</Text>
          <Text style={styles.manualSelectHint}>
            Showing all pending items ranked by how closely they matched the
            scanned label.
          </Text>

          {task.items
            .filter((item) => item.onboardedQty < item.qty)
            .map((item) => {
              const { score, breakdown } = scoreMatch(
                item,
                lastAiResult,
                selectedFormat,
              );
              const pct = Math.round(score * 100);
              const isGood = pct >= 52;

              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.manualItemCard,
                    isGood && styles.manualItemCardHighlighted,
                  ]}
                  onPress={() => {
                    setActiveItem(item);
                    setSizeConfirmed(item.format === "75cl");
                    setBatchQty(1);
                    setCurrentStep("confirm_qty");
                  }}
                >
                  {/* Score badge */}
                  <View
                    style={[
                      styles.scoreBadge,
                      { backgroundColor: isGood ? "#4f46e5" : "#334155" },
                    ]}
                  >
                    <Text style={styles.scoreBadgeText}>{pct}%</Text>
                  </View>

                  <View style={styles.itemInfo}>
                    <Text style={styles.producerText}>{item.producerName}</Text>
                    <Text style={styles.wineNameText}>{item.wineName}</Text>
                    <View style={styles.itemMeta}>
                      <Text style={styles.metaBadge}>{item.vintage}</Text>
                      <Text style={styles.metaBadge}>{item.format}</Text>
                      <Text style={styles.metaBadge}>
                        {item.onboardedQty}/{item.qty} done
                      </Text>
                    </View>

                    {/* Score breakdown bar */}
                    <View style={styles.scoreBreakdownRow}>
                      {[
                        { label: "Name", value: breakdown.wineName },
                        { label: "Vintage", value: breakdown.vintage },
                        { label: "Format", value: breakdown.format },
                        { label: "Producer", value: breakdown.producer },
                      ].map(({ label, value }) => (
                        <View key={label} style={styles.scoreBreakdownItem}>
                          <View style={styles.scoreBarBg}>
                            <View
                              style={[
                                styles.scoreBarFill,
                                { width: `${Math.round((value ?? 0) * 100)}%` },
                              ]}
                            />
                          </View>
                          <Text style={styles.scoreBarLabel}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
            // Sort by score descending so best matches appear first
            .sort((a, b) => {
              const scoreA = scoreMatch(
                task.items.find((i) => i.id === (a as any).key)!,
                lastAiResult,
                selectedFormat,
              ).score;
              const scoreB = scoreMatch(
                task.items.find((i) => i.id === (b as any).key)!,
                lastAiResult,
                selectedFormat,
              ).score;
              return scoreB - scoreA;
            })}
        </ScrollView>
      )}
      {/* SUCCESS */}
      {currentStep === "success" && activeItem && (
        <View style={styles.successContainer}>
          <View style={styles.successCircle}>
            <CheckCircle2 size={80} color="#10b981" strokeWidth={3} />
          </View>
          <Text style={styles.successTitle}>
            {isTaskComplete
              ? "Task Complete!"
              : batchBottleIds.length > 1
                ? `${verifiedBottleIdsSet.size} Bottles Verified!`
                : "Bottle Verified!"}
          </Text>
          <Text style={styles.successDesc}>
            {isTaskComplete
              ? "All bottles for this task have been successfully verified."
              : batchBottleIds.length > 1
                ? `${verifiedBottleIdsSet.size} of ${batchBottleIds.length} bottles have been matched and verified${issuedBottleIdsSet.size > 0 ? `, with ${issuedBottleIdsSet.size} issue(s) reported` : ""}.`
                : "The bottle has been matched and the QR code is verified."}
          </Text>

          <TouchableOpacity
            style={[
              styles.mainButton,
              { backgroundColor: "#10b981", marginTop: 40 },
            ]}
            onPress={() => {
              if (batchBottleIds.length > 1) {
                router.push({
                  pathname: "/tagging",
                  params: {
                    bottleIds: [...verifiedBottleIdsSet].join(","),
                    source: "onboarding",
                    fromOnboardingId: id,
                    wineName: activeItem.wineName,
                    wineVintage: String(activeItem.vintage ?? ""),
                    wineProducer: activeItem.producerName ?? "",
                    wineFormat: activeItem.format ?? "",
                  },
                });
              } else {
                router.push({
                  pathname: "/tagging",
                  params: {
                    bottleId: verifiedBottleId,
                    source: "onboarding",
                    fromOnboardingId: id,
                  },
                });
              }
            }}
          >
            <MapPin size={24} color="#fff" />
            <Text style={styles.mainButtonText}>
              {batchBottleIds.length > 1
                ? `Tag Location for All ${verifiedBottleIdsSet.size} Bottles`
                : "Add Location Tag Now"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() =>
              isTaskComplete
                ? router.dismissTo("/onboarding")
                : setCurrentStep("overview")
            }
          >
            <Text style={styles.secondaryButtonText}>
              {isTaskComplete ? "Finish & View All Tasks" : "Next Bottle"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ... all your existing styles unchanged ...
  container: { flex: 1, backgroundColor: "#0f172a" },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  header: { flexDirection: "row", alignItems: "center", padding: 24, gap: 16 },
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
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  content: { flex: 1, padding: 24 },
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
  statsValue: { color: "#fff", fontSize: 14, fontWeight: "900" },
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
  itemInfo: { flex: 1 },
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
  itemMeta: { flexDirection: "row", gap: 8 },
  metaBadge: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "#334155",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemProgress: { alignItems: "center", gap: 4 },
  qtyText: { color: "#fff", fontSize: 16, fontWeight: "900" },
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
  formatToggleText: { color: "#f8fafc", fontSize: 14, fontWeight: "700" },
  formatChipsWrapper: { width: "100%" },
  formatChips: { paddingHorizontal: 20, gap: 12 },
  formatChip: {
    backgroundColor: "rgba(30, 41, 59, 0.85)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#475569",
  },
  formatChipSelected: { backgroundColor: "#4f46e5", borderColor: "#6366f1" },
  formatChipText: { color: "#cbd5e1", fontSize: 14, fontWeight: "800" },
  formatChipTextSelected: { color: "#fff" },
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
  mainButtonText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  cameraContainer: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
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
  verifyContainer: { flex: 1, padding: 24 },
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
  matchProducer: { color: "#64748b", fontSize: 14, fontWeight: "800" },
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
  matchMetaText: { color: "#64748b", fontSize: 14, fontWeight: "700" },
  metaDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#cbd5e1" },
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
  },
  skuLabel: { fontSize: 14, fontWeight: "700", color: "#64748b", marginTop: 4 },
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
  qrCamera: { flex: 1 },
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
  confirmFormatButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  cancelFormatButton: {
    marginTop: 12,
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "#334155",
  },
  cancelFormatButtonText: { color: "#cbd5e1", fontSize: 16, fontWeight: "700" },
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
  secondaryButton: { padding: 20, marginTop: 20 },
  secondaryButtonText: { color: "#64748b", fontSize: 16, fontWeight: "800" },
  reportIssueButton: {
    flexDirection: "row",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 20,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  reportIssueButtonText: { color: "#ef4444", fontSize: 18, fontWeight: "900" },
  permissionText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
  },
  capturedContainer: { flex: 1, backgroundColor: "#000" },
  capturedImage: { flex: 1, resizeMode: "cover", opacity: 0.6 },
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
  bottleIdText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  issuesText: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  // New styles for no-match screen
  noMatchContainer: {
    flex: 1,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  noMatchIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  noMatchTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 12,
  },
  noMatchDesc: {
    color: "#94a3b8",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  noMatchDetectedCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 8,
  },
  noMatchDetectedLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  noMatchDetectedWine: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  noMatchDetectedName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 12,
  },
  noMatchMeta: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  manualSelectButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  manualSelectButtonText: {
    color: "#64748b",
    fontSize: 16,
    fontWeight: "800",
    textDecorationLine: "underline",
  },
  manualSelectHint: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 20,
    lineHeight: 20,
  },
  manualItemCard: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  manualItemCardHighlighted: {
    borderColor: "#4f46e5",
    backgroundColor: "#1e1b4b",
  },
  scoreBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scoreBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  scoreBreakdownRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  scoreBreakdownItem: {
    flex: 1,
    gap: 4,
  },
  scoreBarBg: {
    height: 4,
    backgroundColor: "#334155",
    borderRadius: 2,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    backgroundColor: "#4f46e5",
    borderRadius: 2,
  },
  scoreBarLabel: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
