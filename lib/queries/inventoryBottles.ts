import { apiFetch } from "@/lib/api";
import { InventoryBottle } from "@/types";
import { withCache } from "./cache";

export async function getReceivedAndShelvedBottles(limitCount: number = 3000): Promise<InventoryBottle[]> {
  return withCache(`active_bottles_${limitCount}`, 2 * 60 * 1000, async () => {
    const params = new URLSearchParams({
      status: "received,shelved",
      limit: String(limitCount),
    });
    const data = await apiFetch(`/bottles?${params}`);
    return (data.bottles || data) as InventoryBottle[];
  });
}

export async function countBottlesByWineAndStore(
  wineId: string,
  storeId: string,
  statuses: string[]
): Promise<number> {
  const params = new URLSearchParams({
    masterWineId: wineId,
    storeId,
    status: statuses.join(","),
    countOnly: "true",
  });
  const data = await apiFetch(`/bottles?${params}`);
  return data.count ?? (data.bottles?.length ?? 0);
}

export async function countBottlesByWine(
  wineId: string,
  statuses: string[]
): Promise<number> {
  const params = new URLSearchParams({
    masterWineId: wineId,
    status: statuses.join(","),
    countOnly: "true",
  });
  const data = await apiFetch(`/bottles?${params}`);
  return data.count ?? (data.bottles?.length ?? 0);
}

export async function getBottlesByWine(
  wineId: string,
  statuses: string[],
  storeId?: string,
  limitCount?: number
): Promise<InventoryBottle[]> {
  const params = new URLSearchParams({
    masterWineId: wineId,
    status: statuses.join(","),
  });
  if (storeId) params.set("storeId", storeId);
  if (limitCount) params.set("limit", String(limitCount));
  const data = await apiFetch(`/bottles?${params}`);
  return (data.bottles || data) as InventoryBottle[];
}

export async function batchCountBottles(
  pairs: { wineId: string; storeId: string }[],
  statuses: string[]
) {
  // Execute in parallel
  const results = await Promise.all(
    pairs.map(p => countBottlesByWineAndStore(p.wineId, p.storeId, statuses))
  );
  return results;
}

export async function countBottlesForStoreDashboard(
  storeId: string,
  settings: any[]
) {
  const pairs = settings.map(s => {
    const wineId = s.masterWineId || s.wineId || (s.masterWineRef?.id) || (s.wineRef?.id);
    return { wineId, storeId };
  });
  return batchCountBottles(pairs, ["shelved", "received"]);
}
