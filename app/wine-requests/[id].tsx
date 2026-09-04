import { Colors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { logActivity } from "@/lib/utils/activityLogger";
import { formatDate } from "@/lib/utils/format";
import { InventoryBottle, PulloutRequest, WineRequest } from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  getWineRequestFromCache,
  setWineRequestInCache,
} from "@/lib/queries/wineRequests";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  QrCode,
  ScanQrCode,
  Truck,
  Wine,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const theme = Colors.store;

export default function WineRequestDetail() {
  const { id, openScanner, initialData } = useLocalSearchParams<{
    id: string;
    openScanner?: string;
    initialData?: string;
  }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const isProcessing = useRef(false);

  const [request, setRequest] = useState<WineRequest | null>(() => {
    if (id) {
      const cached = getWineRequestFromCache(id);
      if (cached) return cached;
    }
    if (initialData) {
      try {
        return JSON.parse(initialData);
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(!request);

  // Batch Mode States
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [pulloutRequest, setPulloutRequest] = useState<PulloutRequest | null>(null);
  const [batchBottles, setBatchBottles] = useState<{
    bottleId: string;
    readableId?: string;
    masterWineId: string;
    wineName: string;
    vintage?: string;
    format?: string;
    producer?: string;
  }[]>([]);
  const [verifiedBottleIds, setVerifiedBottleIds] = useState<Set<string>>(new Set());
  const [skippedBottleIds, setSkippedBottleIds] = useState<Set<string>>(new Set());
  const lastBatchScanTime = useRef<number>(0);
  const requestRef = useRef<WineRequest | null>(null);
  requestRef.current = request;

  const isBottleVerified = (bottle: { bottleId: string; readableId?: string }) =>
    verifiedBottleIds.has(bottle.bottleId) ||
    (bottle.readableId ? verifiedBottleIds.has(bottle.readableId) : false);

  const isBottleSkipped = (bottle: { bottleId: string; readableId?: string }) =>
    skippedBottleIds.has(bottle.bottleId) ||
    (bottle.readableId ? skippedBottleIds.has(bottle.readableId) : false);

  const isBottleHandled = (bottle: { bottleId: string; readableId?: string }) =>
    isBottleVerified(bottle) || isBottleSkipped(bottle);

  const getItemExpectedQty = (
    item: any,
    bottlesList?: typeof batchBottles,
  ) => {
    if (bottlesList && bottlesList.length > 0) {
      const countForWine = bottlesList.filter(
        (b) => b.masterWineId === item.masterWineId,
      ).length;
      if (countForWine > 0) return countForWine;
    }
    if (item.pulledQty !== undefined && item.pulledQty !== null && item.pulledQty > 0) {
      return item.pulledQty;
    }
    return Math.max(0, item.qty - (item.skippedQty || 0));
  };

  const checkIsAllReceived = (
    currentItems: any[],
    currentBatchBottles?: typeof batchBottles,
    currentVerified?: Set<string>,
    currentSkipped?: Set<string>,
  ) => {
    if (!currentItems || currentItems.length === 0) return false;

    if (currentBatchBottles && currentBatchBottles.length > 0) {
      const vSet = currentVerified || verifiedBottleIds;
      const sSet = currentSkipped || skippedBottleIds;
      const allBatchDone = currentBatchBottles.every(
        (b) =>
          vSet.has(b.bottleId) ||
          (b.readableId ? vSet.has(b.readableId) : false) ||
          sSet.has(b.bottleId) ||
          (b.readableId ? sSet.has(b.readableId) : false),
      );
      if (allBatchDone) return true;
    }

    return currentItems.every((i) => {
      const expected = getItemExpectedQty(i, currentBatchBottles);
      return (i.ingressedQty || 0) + (i.skippedQty || 0) >= expected;
    });
  };

  const finalizeBatchReceiving = async (
    customVerified?: Set<string>,
    customSkipped?: Set<string>,
  ) => {
    const currentReq = requestRef.current || request;
    if (!currentReq) return;

    const vSet = customVerified || verifiedBottleIds;
    const sSet = customSkipped || skippedBottleIds;

    const finalItems = currentReq.items.map((item) => {
      const verifiedCount = batchBottles.filter(
        (b) =>
          b.masterWineId === item.masterWineId &&
          (vSet.has(b.bottleId) || (b.readableId ? vSet.has(b.readableId) : false)),
      ).length;
      const skippedCount = batchBottles.filter(
        (b) =>
          b.masterWineId === item.masterWineId &&
          (sSet.has(b.bottleId) || (b.readableId ? sSet.has(b.readableId) : false)),
      ).length;
      return {
        ...item,
        ingressedQty: Math.max(item.ingressedQty || 0, verifiedCount),
        skippedQty: Math.max(item.skippedQty || 0, skippedCount),
      };
    });

    const allReceived = checkIsAllReceived(finalItems, batchBottles, vSet, sSet);
    const newStatus = allReceived ? "ingress_complete" : "receiving";

    try {
      await apiFetch(`/wine-requests/${currentReq.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          items: finalItems,
          status: newStatus,
        }),
      });

      setRequest((prev) =>
        prev ? { ...prev, items: finalItems, status: newStatus as any } : prev,
      );

      await AsyncStorage.removeItem(`dashboard_metrics_${currentReq.storeId}`);

      if (newStatus === "ingress_complete") {
        logActivity({
          action: "WINE_REQUEST_INGRESS_COMPLETE",
          entity: "wine_requests",
          entityId: currentReq.id,
          summary: `Completed receiving all items for wine request ${currentReq.id}`,
          details: {
            wineRequestId: currentReq.id,
            verifiedCount: vSet.size,
            status: "ingress_complete",
          },
          performedBy: profile?.email || "unknown",
          performedByRole: profile?.role || "store",
          source: (profile?.role as any) || "store",
        });
      }
    } catch (err) {
      console.error("Failed to finalize wine request receiving:", err);
    }
  };

  useEffect(() => {
    if (id) fetchRequest();
  }, [id]);

  useEffect(() => {
    if (openScanner === "true") {
      setScanning(true);
    }
  }, [openScanner]);

  const fetchRequest = async () => {
    if (!id) return;
    if (!requestRef.current && !getWineRequestFromCache(id)) {
      setLoading(true);
    }
    try {
      const reqData = (await apiFetch(`/wine-requests/${id}`)) as WineRequest;
      setRequest(reqData);
      setWineRequestInCache(reqData);
      // Immediately release loading so UI renders right away!
      setLoading(false);

      // Determine pullout requests associated with this wine request
      let pullouts: PulloutRequest[] = (reqData as any).pullouts || [];

      // Only query /pullout-requests if pullouts field was completely omitted by server
      if ((reqData as any).pullouts === undefined) {
        try {
          const pulloutData = await apiFetch(`/pullout-requests?wineRequestId=${id}`);
          const rawPullouts: PulloutRequest[] = pulloutData.pulloutRequests || pulloutData;
          pullouts = Array.isArray(rawPullouts)
            ? rawPullouts.filter((p: any) => p.wineRequestId === id)
            : [];
        } catch (poErr) {
          console.warn("Failed to fetch pullout requests for wine request:", poErr);
          pullouts = [];
        }
      } else {
        pullouts = pullouts.filter((p: any) => p.wineRequestId === id);
      }

      if (pullouts && pullouts.length > 0) {
        setPulloutRequest(pullouts[0]);

        const bottles: any[] = [];
        const seenBottleIds = new Set<string>();

        pullouts.forEach((poData) => {
          poData.items?.forEach((item: any) => {
            if (item.pulledBottleIds && Array.isArray(item.pulledBottleIds)) {
              item.pulledBottleIds.forEach((bid: string) => {
                const trimmedBid = bid?.trim();
                if (trimmedBid && !seenBottleIds.has(trimmedBid.toLowerCase())) {
                  seenBottleIds.add(trimmedBid.toLowerCase());
                  bottles.push({
                    bottleId: trimmedBid,
                    readableId: trimmedBid,
                    masterWineId: item.masterWineId,
                    wineName: item.wineName,
                    vintage: item.vintage,
                    format: item.format,
                    producer: item.producer,
                  });
                }
              });
            }
          });
        });

        setBatchBottles(bottles);

        // Pre-populate verifiedBottleIds in background without blocking screen
        if (bottles.length > 0) {
          try {
            const bottleIdList = bottles.map((b) => b.bottleId).join(",");
            const bottleRecords = await apiFetch(`/bottles?ids=${bottleIdList}&minimal=true`);
            const bottleArr = Array.isArray(bottleRecords)
              ? bottleRecords
              : Array.isArray(bottleRecords?.bottles)
              ? bottleRecords.bottles
              : [];

            if (bottleArr.length > 0) {
              const alreadyReceivedIds = new Set<string>();
              const expectedSet = new Set(bottles.map((b) => b.bottleId.toLowerCase()));

              bottleArr.forEach((b: any) => {
                const bId = b.bottleId?.toLowerCase();
                const uId = b.id?.toLowerCase();
                if (expectedSet.has(bId) || expectedSet.has(uId)) {
                  if (
                    b.status === "received" ||
                    b.status === "shelved" ||
                    b.status === "open" ||
                    b.status === "consumed" ||
                    (b.storeId === reqData.storeId && b.status !== "outbound")
                  ) {
                    if (b.bottleId) alreadyReceivedIds.add(b.bottleId);
                    if (b.id) alreadyReceivedIds.add(b.id);
                  }
                }
              });

              if (alreadyReceivedIds.size > 0) {
                setVerifiedBottleIds((prev) => new Set([...prev, ...alreadyReceivedIds]));
              }

              // Auto-heal status if all bottles were already received but status wasn't updated
              const isCompleteOnLoad = checkIsAllReceived(
                reqData.items,
                bottles,
                alreadyReceivedIds,
                new Set(),
              );

              if (isCompleteOnLoad && reqData.status !== "ingress_complete") {
                apiFetch(`/wine-requests/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ status: "ingress_complete" }),
                }).catch((syncErr) => console.warn("Could not auto-sync ingress_complete status:", syncErr));
                reqData.status = "ingress_complete";
                setRequest({ ...reqData, status: "ingress_complete" });
              }
            }
          } catch (bErr) {
            console.warn("Could not check bottle received statuses:", bErr);
          }
        }
      } else {
        setPulloutRequest(null);
        setBatchBottles([]);
      }
    } catch (err) {
      console.error("Failed to fetch request:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (!scanning || !request || isProcessing.current) return;
    isProcessing.current = true;
    setScanning(false);

    try {
      let bottleData: InventoryBottle;
      try {
        bottleData = await apiFetch(`/bottles/${data}`);
      } catch {
        Alert.alert("Not Found", `No bottle found with ID: ${data}`, [
          { text: "OK", onPress: () => setScanning(true) },
        ]);
        return;
      }

      if (bottleData.storeId === request.storeId) {
        Alert.alert(
          "Already Received",
          "This bottle has already been received for this request.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }
      if (bottleData.outboundStoreId !== request.storeId) {
        Alert.alert(
          "Wrong Store",
          "This bottle is not designated for your location.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }

      if (bottleData.status !== "outbound") {
        Alert.alert(
          "Invalid Status",
          `Bottle status is '${bottleData.status}', not 'outbound'.`,
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }

      const masterWineId = bottleData.masterWineId;
      const itemIndex = request.items.findIndex(
        (i) => i.masterWineId === masterWineId,
      );

      if (itemIndex === -1) {
        Alert.alert("Not in Request", "This wine is not part of the request.", [
          { text: "OK", onPress: () => setScanning(true) },
        ]);
        return;
      }

      const item = request.items[itemIndex];
      const ingressedQty = item.ingressedQty || 0;
      const skippedQty = item.skippedQty || 0;
      const targetQty = getItemExpectedQty(item, batchBottles);

      if (ingressedQty + skippedQty >= targetQty) {
        Alert.alert(
          "Fully Handled",
          "All expected available units of this wine have been received.",
          [{ text: "OK", onPress: () => setScanning(true) }],
        );
        return;
      }

      await apiFetch(`/bottles/${data}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "received",
          storeId: request.storeId,
          locationId: null,
          outboundStoreId: null,
        }),
      });

      const newItems = [...request.items];
      newItems[itemIndex] = {
        ...item,
        ingressedQty: (item.ingressedQty || 0) + 1,
      };

      const allReceived = checkIsAllReceived(newItems, batchBottles);
      const newStatus = allReceived ? "ingress_complete" : "receiving";

      await apiFetch(`/wine-requests/${request.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          items: newItems,
          status: newStatus,
        }),
      });

      setRequest((prev) =>
        prev ? { ...prev, items: newItems, status: newStatus as any } : prev,
      );

      // Invalidate dashboard metrics cache for this store
      await AsyncStorage.removeItem(`dashboard_metrics_${request.storeId}`);

      setVerifiedBottleIds((prev) => new Set(prev).add(data));

      // Log the receive operation
      logActivity({
        action: newStatus === "ingress_complete" ? "WINE_REQUEST_INGRESS_COMPLETE" : "BOTTLE_RECEIVED",
        entity: "wine_requests",
        entityId: request.id,
        summary: `Received bottle ${data} (${item.wineName}) for wine request ${request.id}${newStatus === "ingress_complete" ? " — all items received" : ""
          }`,
        details: {
          bottleId: data,
          wineName: item.wineName,
          ingressedQty: (item.ingressedQty || 0) + 1,
          targetQty: item.qty,
          requestStatus: newStatus,
        },
        performedBy: profile?.email || "unknown",
        performedByRole: profile?.role || "store",
        source: (profile?.role as any) || "store",
      });

      const scannedBottleId = data;

      if (allReceived) {
        const allBottleIds =
          batchBottles.length > 0
            ? batchBottles.map((b) => b.bottleId)
            : (pulloutRequest?.items?.flatMap((pi: any) => pi.pulledBottleIds || []) || [scannedBottleId]);

        const uniqueBottleIds = Array.from(new Set(allBottleIds)).filter(Boolean);
        const firstBottle = batchBottles.find((b) => b.bottleId === uniqueBottleIds[0]);
        const isMultipleWines = batchBottles.some(
          (b) => b.masterWineId !== firstBottle?.masterWineId,
        );

        Alert.alert(
          "✓ All Items Received",
          `${item.wineName} has been received.\n\nAll bottles in this request have been received! Would you like to tag a storage location for the ${uniqueBottleIds.length} received bottle${uniqueBottleIds.length > 1 ? "s" : ""}?`,
          [
            {
              text: `Tag Location${uniqueBottleIds.length > 1 ? `s (${uniqueBottleIds.length})` : ""}`,
              onPress: () => {
                if (uniqueBottleIds.length > 1) {
                  router.replace({
                    pathname: "/tagging",
                    params: {
                      bottleIds: uniqueBottleIds.join(","),
                      mode: "tagging",
                      source: "wine-request",
                      fromRequestId: id,
                      wineName: isMultipleWines ? "Multiple Wines" : (firstBottle?.wineName || item.wineName),
                      wineVintage: isMultipleWines ? "" : (firstBottle?.vintage || item.vintage || ""),
                      wineProducer: isMultipleWines ? "" : (firstBottle?.producer || item.producer || ""),
                      wineFormat: isMultipleWines ? "" : (firstBottle?.format || item.format || ""),
                    },
                  });
                } else {
                  router.replace({
                    pathname: "/tagging",
                    params: {
                      bottleId: uniqueBottleIds[0] || scannedBottleId,
                      mode: "tagging",
                      source: "wine-request",
                      fromRequestId: id,
                      wineName: firstBottle?.wineName || item.wineName,
                      wineVintage: firstBottle?.vintage || item.vintage || "",
                      wineProducer: firstBottle?.producer || item.producer || "",
                      wineFormat: firstBottle?.format || item.format || "",
                    },
                  });
                }
              },
            },
            {
              text: "Scan Next",
              onPress: () => {
                setScanning(true);
              },
            },
            {
              text: "Done",
              style: "cancel",
            },
          ],
        );
      } else {
        Alert.alert(
          "✓ Received",
          `${item.wineName} has been received.`,
          [
            {
              text: "Scan Next",
              onPress: () => {
                setScanning(true);
              },
            },
            {
              text: "Done",
              style: "cancel",
            },
          ],
        );
      }

      fetchRequest();
    } catch (error) {
      console.error("Error receiving bottle:", error);
      Alert.alert("Error", "An error occurred while receiving the bottle.", [
        { text: "OK", onPress: () => setScanning(true) },
      ]);
    } finally {
      isProcessing.current = false;
    }
  };

  const handleBatchQRScan = async ({ data }: { data: string }) => {
    if (!isBatchMode || !request || isProcessing.current) return;

    const now = Date.now();
    if (now - lastBatchScanTime.current < 2000) return;

    const trimmedData = data?.trim();
    if (!trimmedData) return;

    let expectedBottle = batchBottles.find(
      (b) =>
        b.bottleId === trimmedData ||
        b.readableId === trimmedData ||
        b.bottleId?.toLowerCase() === trimmedData.toLowerCase() ||
        b.readableId?.toLowerCase() === trimmedData.toLowerCase(),
    );

    if (!expectedBottle) {
      try {
        const bottleData = await apiFetch(`/bottles/${trimmedData}`);
        if (bottleData) {
          expectedBottle = batchBottles.find(
            (b) =>
              b.bottleId === bottleData.bottleId ||
              b.bottleId === bottleData.id ||
              b.readableId === bottleData.bottleId ||
              b.readableId === bottleData.id ||
              b.bottleId?.toLowerCase() === bottleData.bottleId?.toLowerCase() ||
              b.bottleId?.toLowerCase() === bottleData.id?.toLowerCase(),
          );
        }
      } catch {
        // bottle lookup failed
      }
    }

    if (!expectedBottle) {
      lastBatchScanTime.current = now;
      Alert.alert("Invalid QR", "This bottle is not part of this request.", [{ text: "OK" }]);
      return;
    }

    if (isBottleHandled(expectedBottle)) return;

    lastBatchScanTime.current = now;
    isProcessing.current = true;

    try {
      await apiFetch(`/bottles/${expectedBottle.bottleId || trimmedData}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "received",
          storeId: request.storeId,
          locationId: null,
          outboundStoreId: null,
        }),
      });

      const currentReq = requestRef.current || request;
      const nextVerified = new Set(verifiedBottleIds);
      nextVerified.add(expectedBottle!.bottleId);
      if (expectedBottle!.readableId) nextVerified.add(expectedBottle!.readableId);
      nextVerified.add(trimmedData);

      const itemIndex = currentReq.items.findIndex(
        (i) => i.masterWineId === expectedBottle!.masterWineId,
      );

      let newStatus = currentReq.status;
      let newItems = [...currentReq.items];

      if (itemIndex !== -1) {
        const item = currentReq.items[itemIndex];
        const verifiedCount = batchBottles.filter(
          (b) =>
            b.masterWineId === item.masterWineId &&
            (nextVerified.has(b.bottleId) || (b.readableId ? nextVerified.has(b.readableId) : false)),
        ).length;

        newItems[itemIndex] = {
          ...item,
          ingressedQty: Math.max((item.ingressedQty || 0) + 1, verifiedCount),
        };

        const allReceived = checkIsAllReceived(newItems, batchBottles, nextVerified, skippedBottleIds);
        newStatus = allReceived ? "ingress_complete" : "receiving";

        await apiFetch(`/wine-requests/${currentReq.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            items: newItems,
            status: newStatus,
          }),
        });

        setRequest((prev) =>
          prev ? { ...prev, items: newItems, status: newStatus as any } : prev,
        );
      }

      setVerifiedBottleIds(nextVerified);
      await AsyncStorage.removeItem(`dashboard_metrics_${currentReq.storeId}`);

      logActivity({
        action: newStatus === "ingress_complete" ? "WINE_REQUEST_INGRESS_COMPLETE" : "BOTTLE_RECEIVED",
        entity: "wine_requests",
        entityId: request.id,
        summary: `Batch received bottle ${expectedBottle.readableId || expectedBottle.bottleId} (${expectedBottle.wineName}) for wine request ${request.id}${
          newStatus === "ingress_complete" ? " — all items received" : ""
        }`,
        details: {
          bottleId: expectedBottle.bottleId,
          wineName: expectedBottle.wineName,
          requestStatus: newStatus,
          batch: true,
        },
        performedBy: profile?.email || "unknown",
        performedByRole: profile?.role || "store",
        source: (profile?.role as any) || "store",
      });
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to receive bottle.");
    } finally {
      isProcessing.current = false;
    }
  };

  const handleBatchSkip = async (bottleId: string, masterWineId: string) => {
    const currentReq = requestRef.current || request;
    if (!currentReq || isProcessing.current) return;

    Alert.alert("Report Missing", "Mark this bottle as not arrived?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "destructive",
        onPress: async () => {
          isProcessing.current = true;
          try {
            const nextSkipped = new Set(skippedBottleIds);
            nextSkipped.add(bottleId);
            const b = batchBottles.find((x) => x.bottleId === bottleId);
            if (b?.readableId) nextSkipped.add(b.readableId);

            const itemIndex = currentReq.items.findIndex(
              (i) => i.masterWineId === masterWineId,
            );
            let newStatus = currentReq.status;
            let newItems = [...currentReq.items];
            if (itemIndex !== -1) {
              const item = currentReq.items[itemIndex];
              const skippedCount = batchBottles.filter(
                (bt) =>
                  bt.masterWineId === item.masterWineId &&
                  (nextSkipped.has(bt.bottleId) || (bt.readableId ? nextSkipped.has(bt.readableId) : false)),
              ).length;

              newItems[itemIndex] = {
                ...item,
                skippedQty: Math.max((item.skippedQty || 0) + 1, skippedCount),
              };

              const allReceived = checkIsAllReceived(newItems, batchBottles, verifiedBottleIds, nextSkipped);
              newStatus = allReceived ? "ingress_complete" : "receiving";

              await apiFetch(`/wine-requests/${currentReq.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  items: newItems,
                  status: newStatus,
                }),
              });

              setRequest((prev) =>
                prev ? { ...prev, items: newItems, status: newStatus as any } : prev,
              );
            }

            setSkippedBottleIds(nextSkipped);
            await AsyncStorage.removeItem(`dashboard_metrics_${currentReq.storeId}`);
          } catch (err) {
            console.error(err);
            Alert.alert("Error", "Failed to skip bottle.");
          } finally {
            isProcessing.current = false;
          }
        },
      },
    ]);
  };

  const handleBatchBulkNoQR = async () => {
    const currentReq = requestRef.current || request;
    if (!currentReq || isProcessing.current) return;

    const pendingBottles = batchBottles.filter((b) => !isBottleHandled(b));
    if (pendingBottles.length === 0) return;

    Alert.alert(
      "Batch Skip QR?",
      `Are you sure you want to mark the remaining ${pendingBottles.length} bottle(s) as received without scanning their QR labels?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Receive All",
          onPress: async () => {
            isProcessing.current = true;
            try {
              await Promise.all(
                pendingBottles.map((b) =>
                  apiFetch(`/bottles/${b.bottleId}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      status: "received",
                      isTagged: false,
                      storeId: currentReq.storeId,
                      locationId: null,
                      outboundStoreId: null,
                    }),
                  }),
                ),
              );

              const nextVerified = new Set(verifiedBottleIds);
              pendingBottles.forEach((b) => {
                nextVerified.add(b.bottleId);
                if (b.readableId) nextVerified.add(b.readableId);
              });

              const newItems = currentReq.items.map((item) => {
                const verifiedCount = batchBottles.filter(
                  (b) =>
                    b.masterWineId === item.masterWineId &&
                    (nextVerified.has(b.bottleId) || (b.readableId ? nextVerified.has(b.readableId) : false)),
                ).length;
                return {
                  ...item,
                  ingressedQty: Math.max(item.ingressedQty || 0, verifiedCount),
                };
              });

              const isAllReceived = checkIsAllReceived(newItems, batchBottles, nextVerified, skippedBottleIds);
              const newStatus = isAllReceived ? "ingress_complete" : currentReq.status;

              await apiFetch(`/wine-requests/${currentReq.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  items: newItems,
                  status: newStatus,
                }),
              });

              logActivity({
                action: isAllReceived ? "WINE_REQUEST_INGRESS_COMPLETE" : "WINE_REQUEST_INGRESS_MANUAL_BATCH",
                entity: "wine_requests",
                entityId: currentReq.id,
                summary: `Manually received ${pendingBottles.length} bottle(s) at store without QR${isAllReceived ? " — all items received" : ""}`,
                details: {
                  bottleIds: pendingBottles.map((b) => b.bottleId),
                  storeId: currentReq.storeId,
                  manual_ingress: true,
                  status: newStatus,
                },
                performedBy: profile?.email || "unknown",
                performedByRole: profile?.role || "store",
                source: (profile?.role as any) || "store",
              });

              setRequest((prev) =>
                prev ? { ...prev, items: newItems, status: newStatus as any } : prev,
              );
              setVerifiedBottleIds(nextVerified);
              await AsyncStorage.removeItem(`dashboard_metrics_${currentReq.storeId}`);
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to receive bottles manually.");
            } finally {
              isProcessing.current = false;
            }
          },
        },
      ],
    );
  };

  const handleBatchNoQR = async (bottleId: string) => {
    const currentReq = requestRef.current || request;
    if (!currentReq || isProcessing.current) return;

    const expectedBottle = batchBottles.find(
      (b) => b.bottleId === bottleId || b.readableId === bottleId,
    );
    if (!expectedBottle) return;

    if (isBottleHandled(expectedBottle)) return;

    Alert.alert(
      "No QR Code?",
      "Mark this bottle as received even though there is no QR label?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Receive",
          onPress: async () => {
            isProcessing.current = true;
            try {
              await apiFetch(`/bottles/${expectedBottle.bottleId || bottleId}`, {
                method: "PATCH",
                body: JSON.stringify({
                  status: "received",
                  isTagged: false,
                  storeId: currentReq.storeId,
                  locationId: null,
                  outboundStoreId: null,
                }),
              });

              const nextVerified = new Set(verifiedBottleIds);
              nextVerified.add(expectedBottle.bottleId);
              if (expectedBottle.readableId) nextVerified.add(expectedBottle.readableId);

              const itemIndex = currentReq.items.findIndex(
                (i) => i.masterWineId === expectedBottle.masterWineId,
              );
              let newStatus = currentReq.status;
              let newItems = [...currentReq.items];

              if (itemIndex > -1) {
                const item = currentReq.items[itemIndex];
                const verifiedCount = batchBottles.filter(
                  (b) =>
                    b.masterWineId === item.masterWineId &&
                    (nextVerified.has(b.bottleId) || (b.readableId ? nextVerified.has(b.readableId) : false)),
                ).length;

                newItems[itemIndex] = {
                  ...item,
                  ingressedQty: Math.max((item.ingressedQty || 0) + 1, verifiedCount),
                };

                const isAllReceived = checkIsAllReceived(newItems, batchBottles, nextVerified, skippedBottleIds);
                newStatus = isAllReceived ? "ingress_complete" : currentReq.status;

                await apiFetch(`/wine-requests/${currentReq.id}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    items: newItems,
                    status: newStatus,
                  }),
                });

                setRequest((prev) =>
                  prev ? { ...prev, items: newItems, status: newStatus as any } : prev,
                );
              }

              setVerifiedBottleIds(nextVerified);
              await AsyncStorage.removeItem(`dashboard_metrics_${currentReq.storeId}`);

              logActivity({
                action: newStatus === "ingress_complete" ? "WINE_REQUEST_INGRESS_COMPLETE" : "WINE_REQUEST_INGRESS_MANUAL",
                entity: "wine_requests",
                entityId: currentReq.id,
                summary: `Manually received bottle ${expectedBottle.readableId || expectedBottle.bottleId} (${expectedBottle.wineName}) at store${newStatus === "ingress_complete" ? " — all items received" : ""}`,
                details: {
                  bottleId: expectedBottle.bottleId,
                  storeId: currentReq.storeId,
                  wineName: expectedBottle.wineName,
                  manual_ingress: true,
                  status: newStatus,
                },
                performedBy: profile?.email || "unknown",
                performedByRole: profile?.role || "store",
                source: (profile?.role as any) || "store",
              });
            } catch (err) {
              console.error(err);
              Alert.alert("Error", "Failed to receive bottle manually.");
            } finally {
              isProcessing.current = false;
            }
          },
        },
      ],
    );
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "pending":
        return {
          color: "#f59e0b",
          bg: "#fef3c7",
          icon: Clock,
          label: "Pending Review",
        };
      case "converted":
        return {
          color: "#eab308",
          bg: "#fef08a",
          icon: Truck,
          label: "Pulling Out",
        };
      case "outbound":
      case "receiving":
        return {
          color: "#3b82f6",
          bg: "#bfdbfe",
          icon: Truck,
          label: "Outbound (In-Transit)",
        };
      case "ingress_complete":
        return {
          color: "#059669",
          bg: "#a7f3d0",
          icon: CheckCircle2,
          label: "Received",
        };
      case "rejected":
        return {
          color: "#ef4444",
          bg: "#fee2e2",
          icon: Ban,
          label: "Rejected",
        };
      default:
        return { color: "#64748b", bg: "#f1f5f9", icon: Clock, label: status };
    }
  };

  if (!permission && scanning) {
    return <View />;
  }

  if (!permission?.granted && scanning) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: "#000", justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelScanButton}
          onPress={() => setScanning(false)}
        >
          <Text style={styles.cancelScanText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isBatchMode) {
    const isAllBatchHandled =
      batchBottles.length > 0 && batchBottles.every(isBottleHandled);
    const verifiedBatchBottles = batchBottles.filter(isBottleVerified);

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsBatchMode(false)} style={styles.backButton}>
            <ArrowLeft size={24} color={theme.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.primary }]}>Batch Receive</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              REQ: {request?.id.slice(0, 8).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          {!isAllBatchHandled ? (
            <View
              style={{
                height: 320,
                margin: 16,
                borderRadius: 24,
                overflow: "hidden",
                backgroundColor: "#000",
              }}
            >
              <CameraView
                style={{ flex: 1 }}
                onBarcodeScanned={handleBatchQRScan}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
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
                    borderColor: theme.primary,
                    borderRadius: 12,
                    backgroundColor: "transparent",
                  }}
                />
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700", marginTop: 12 }}>
                  Scan expected QR label
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ margin: 16, padding: 24, backgroundColor: "#d1fae5", borderRadius: 24, alignItems: "center", justifyContent: "center", gap: 12 }}>
              <CheckCircle2 size={48} color="#059669" />
              <Text style={{ color: "#065f46", fontSize: 18, fontWeight: "900", textTransform: "uppercase" }}>All Wines Processed</Text>
              <Text style={{ color: "#065f46", fontSize: 13, fontWeight: "600", textAlign: "center" }}>
                You have successfully scanned or skipped all expected bottles.
              </Text>
            </View>
          )}

          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
            {batchBottles.map((bottle, index) => {
              const isVerified = isBottleVerified(bottle);
              const isSkipped = isBottleSkipped(bottle);
              const isPending = !isVerified && !isSkipped;

              return (
                <View key={bottle.bottleId} style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: isVerified ? "#10b981" : isSkipped ? "#ef4444" : theme.border, gap: 14 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: isVerified ? "rgba(16,185,129,0.15)" : isSkipped ? "rgba(239,68,68,0.15)" : theme.background, alignItems: "center", justifyContent: "center" }}>
                    {isVerified ? <CheckCircle2 size={18} color="#10b981" /> : isSkipped ? <Ban size={18} color="#ef4444" /> : <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: "900" }}>{index + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>
                      {bottle.wineName}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: "500", marginTop: 2 }}>
                      {[bottle.producer, bottle.vintage, bottle.format].filter(Boolean).join(" · ")}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: "700", fontFamily: "monospace", marginTop: 4 }}>
                      {bottle.readableId || bottle.bottleId}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {(isVerified || isSkipped) && (
                      <Text style={{ color: isVerified ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>
                        {isVerified ? "✓ Received" : "Not Arrived"}
                      </Text>
                    )}
                    {isPending && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleBatchNoQR(bottle.bottleId)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                            paddingVertical: 4,
                            paddingHorizontal: 8,
                            borderRadius: 6,
                            backgroundColor: "rgba(245,158,11,0.1)",
                          }}
                        >
                          <QrCode size={12} color="#f59e0b" strokeWidth={2.5} />
                          <Text style={{ color: "#f59e0b", fontSize: 11, fontWeight: "700" }}>Skip QR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleBatchSkip(bottle.bottleId, bottle.masterWineId)} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.1)" }}>
                          <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "700" }}>Skip</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}
            <View style={{ height: 40 }} />
          </ScrollView>

          <View style={{ padding: 24, backgroundColor: theme.background }}>
            {isAllBatchHandled && (
              <View style={[styles.successIndicator, { marginBottom: 12 }]}>
                <CheckCircle2 size={20} color="#059669" />
                <Text style={styles.successIndicatorText}>
                  All items successfully received
                </Text>
              </View>
            )}

            {isAllBatchHandled && verifiedBatchBottles.length > 0 && (
              <TouchableOpacity
                style={[styles.scanButton, { marginBottom: 12, backgroundColor: "#10b981", shadowColor: "#10b981" }]}
                onPress={async () => {
                  await finalizeBatchReceiving();
                  const firstBottle = verifiedBatchBottles[0];
                  const isMultipleWines = verifiedBatchBottles.some(
                    (b) => b.masterWineId !== firstBottle?.masterWineId,
                  );

                  router.replace({
                    pathname: "/tagging",
                    params: {
                      bottleIds: verifiedBatchBottles.map((b) => b.bottleId).join(","),
                      mode: "tagging",
                      source: "wine-request",
                      fromRequestId: id,
                      wineName: isMultipleWines ? "Multiple Wines" : (firstBottle?.wineName || "Received Wines"),
                      wineVintage: isMultipleWines ? "" : (firstBottle?.vintage || ""),
                      wineProducer: isMultipleWines ? "" : (firstBottle?.producer || ""),
                      wineFormat: isMultipleWines ? "" : (firstBottle?.format || ""),
                    },
                  });
                }}
              >
                <MapPin size={24} color="#fff" strokeWidth={2.5} />
                <Text style={styles.scanButtonText}>Tag {verifiedBatchBottles.length} Location{verifiedBatchBottles.length > 1 ? "s" : ""}</Text>
              </TouchableOpacity>
            )}
            {!isAllBatchHandled && (
              <TouchableOpacity
                style={[styles.scanButton, { marginBottom: 12, backgroundColor: "#f59e0b", shadowColor: "#f59e0b", borderWidth: 0 }]}
                onPress={handleBatchBulkNoQR}
              >
                <QrCode size={24} color="#fff" strokeWidth={2.5} />
                <Text style={styles.scanButtonText}>Batch Skip QR</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.scanButton, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, shadowOpacity: 0 }]}
              onPress={async () => {
                if (isAllBatchHandled) {
                  await finalizeBatchReceiving();
                  fetchRequest();
                }
                setIsBatchMode(false);
              }}
            >
              <Text style={[styles.scanButtonText, { color: theme.text }]}>
                {isAllBatchHandled ? "Done" : "Cancel Batch"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (scanning) {
    return (
      <View style={styles.container}>
        <CameraView
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        >
          <View style={styles.scannerOverlay}>
            <View style={styles.scanTarget} />
            <Text style={styles.scanText}>Scan bottle QR to receive</Text>
            <TouchableOpacity
              onPress={() => setScanning(false)}
              style={styles.cancelScanButton}
            >
              <Text style={styles.cancelScanText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Package size={48} color={theme.border} strokeWidth={1} />
          <Text style={[styles.notFoundText, { color: theme.textSecondary }]}>
            Request not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusConfig = getStatusConfig(request.status);
  const StatusIcon = statusConfig.icon;

  // Check if all requested items have been fully received (or skipped)
  const isAllReceived =
    request.status === "ingress_complete" ||
    checkIsAllReceived(
      request.items,
      batchBottles,
      verifiedBottleIds,
      skippedBottleIds,
    );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={theme.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.primary }]}>
            Request Details
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            REQ: {request.id.slice(0, 8).toUpperCase()}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <View
          style={[styles.statusBanner, { backgroundColor: statusConfig.bg }]}
        >
          <StatusIcon size={20} color={statusConfig.color} strokeWidth={2.5} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
            {request.status === "rejected" && request.rejectionReason && (
              <Text
                style={[
                  styles.statusDate,
                  { color: statusConfig.color + "AA", marginTop: 6 },
                ]}
              >
                Reason: {request.rejectionReason}
              </Text>
            )}
            <Text
              style={[styles.statusDate, { color: statusConfig.color + "AA" }]}
            >
              {formatDate(request.createdAt, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Items */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
        >
          <View style={styles.sectionHeader}>
            <Wine size={16} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Requested Items ({request.items.length})
            </Text>
          </View>

          {request.items.map((wine, idx) => {
            const expectedQty = getItemExpectedQty(wine, batchBottles);
            const isFullySkipped = expectedQty === 0;
            const isItemFulfilled = (wine.ingressedQty || 0) >= expectedQty;

            return (
              <View
                key={idx}
                style={[
                  styles.itemRow,
                  idx < request.items.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  },
                ]}
              >
                {/* Qty pill */}
                <View
                  style={[
                    styles.qtyPill,
                    {
                      backgroundColor: isFullySkipped
                        ? "#fee2e2"
                        : theme.primary + "18",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.qtyText,
                      { color: isFullySkipped ? "#ef4444" : theme.primary },
                    ]}
                  >
                    {wine.qty}x
                  </Text>
                </View>

                {/* Wine info */}
                <View style={{ flex: 1, paddingRight: 4 }}>
                  <Text
                    style={[
                      styles.wineName,
                      { color: theme.text },
                      isFullySkipped && styles.textMuted,
                    ]}
                  >
                    {wine.wineName}
                  </Text>
                  <Text
                    style={[
                      styles.wineMeta,
                      { color: theme.textSecondary },
                      isFullySkipped && styles.textMuted,
                    ]}
                  >
                    {[wine.vintage, wine.format].filter(Boolean).join(" · ")}
                  </Text>
                  {wine.sku && wine.sku !== "N/A" && (
                    <Text
                      style={[
                        styles.wineSku,
                        { color: theme.textSecondary + "88" },
                      ]}
                    >
                      SKU: {wine.sku}
                    </Text>
                  )}
                </View>

                {/* Status indicators for converted requests */}
                {(request.status === "converted" ||
                  request.status === "receiving" ||
                  request.status === "ingress_complete") && (
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <View
                        style={[
                          styles.progressContainer,
                          isItemFulfilled && { backgroundColor: "#d1fae5" }, // Turn purely green when fulfilled
                        ]}
                      >
                        <Text style={styles.progressText}>
                          {wine.ingressedQty || 0} / {expectedQty}
                        </Text>
                        <Text style={styles.progressLabel}>RCVD</Text>
                      </View>
                    </View>
                  )}
              </View>
            );
          })}
        </View>

        {/* Summary */}
        {request.totalAmount > 0 && (
          <View
            style={[
              styles.section,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textSecondary }]}>
                Total Value
              </Text>
              <Text style={[styles.summaryValue, { color: theme.primary }]}>
                ₱{request.totalAmount.toLocaleString()}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textSecondary }]}>
                Total Bottles
              </Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>
                {request.items.reduce(
                  (sum, i) => sum + getItemExpectedQty(i, batchBottles),
                  0,
                )}{" "}
                btls
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer / Call to Actions */}
      {isAllReceived ? (
        <View style={styles.footer}>
          <View style={styles.successIndicator}>
            <CheckCircle2 size={20} color="#059669" />
            <Text style={styles.successIndicatorText}>
              All items successfully received
            </Text>
          </View>
          <TouchableOpacity
            style={styles.scanButton}
            onPress={() => router.dismissTo("/wine-requests")}
          >
            <ArrowLeft size={24} color="#fff" strokeWidth={2.5} />
            <Text style={styles.scanButtonText}>Return to Requests</Text>
          </TouchableOpacity>
        </View>
      ) : (
        (request.status === "receiving" ||
          request.status === "outbound" ||
          (request.status === "ingress_complete" && !isAllReceived)) && (
          <View style={styles.footer}>
            {batchBottles.length > 0 && (
              <TouchableOpacity
                style={[styles.scanButton, { marginBottom: 12, backgroundColor: "#4f46e5", shadowColor: "#4f46e5" }]}
                onPress={() => setIsBatchMode(true)}
              >
                <ScanQrCode size={24} color="#fff" strokeWidth={2.5} />
                <Text style={styles.scanButtonText}>Batch Receive</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.scanButton, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, shadowOpacity: 0 }]}
              onPress={() => setScanning(true)}
            >
              <ScanQrCode size={24} color={theme.text} strokeWidth={2.5} />
              <Text style={[styles.scanButtonText, { color: theme.text }]}>Scan One</Text>
            </TouchableOpacity>
          </View>
        )
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  notFoundText: { fontSize: 15, fontWeight: "600" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 16,
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 20,
    padding: 20,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusDate: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 3,
  },
  section: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  qtyPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "900",
  },
  wineName: {
    fontSize: 14,
    fontWeight: "800",
  },
  wineMeta: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  wineSku: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  textMuted: {
    opacity: 0.4,
    textDecorationLine: "line-through",
  },
  progressContainer: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    minWidth: 64,
  },
  progressText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#065f46",
  },
  progressLabel: {
    fontSize: 8,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#065f46",
    marginTop: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  summaryKey: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "900",
  },
  footer: {
    padding: 24,
    paddingTop: 12,
    backgroundColor: "transparent",
  },
  successIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
    backgroundColor: "#d1fae5",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  successIndicatorText: {
    color: "#065f46",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scanButton: {
    backgroundColor: theme.primary,
    height: 64,
    borderRadius: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanTarget: {
    width: 260,
    height: 260,
    borderWidth: 2,
    borderColor: theme.primary,
    borderRadius: 32,
    marginBottom: 40,
    backgroundColor: "rgba(79, 70, 229, 0.05)",
  },
  scanText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  cancelScanButton: {
    position: "absolute",
    bottom: 60,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cancelScanText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  permissionText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
  },
  permissionButton: {
    backgroundColor: theme.primary,
    margin: 32,
    padding: 18,
    borderRadius: 20,
    alignItems: "center",
  },
  permissionButtonText: {
    color: "#fff",
    fontWeight: "900",
    textTransform: "uppercase",
  },
});
