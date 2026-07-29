import { apiFetch } from "@/lib/api";
import { MasterWine } from "@/types";
import { withCache, invalidatePrefix } from "./cache";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getMasterWines(orderByName: boolean = true, limitCount?: number): Promise<MasterWine[]> {
  const cacheKey = `master_wines_${orderByName}_${limitCount || 'all'}`;
  return withCache(cacheKey, CACHE_TTL, async () => {
    const params = new URLSearchParams();
    if (limitCount) params.set("limit", String(limitCount));
    const path = `/wines${params.toString() ? `?${params}` : ""}`;
    const data = await apiFetch(path);
    const wines: MasterWine[] = data.wines || data;
    if (orderByName) {
      wines.sort((a: MasterWine, b: MasterWine) => (a.name || "").localeCompare(b.name || ""));
    }
    return wines;
  });
}

export async function getMasterWineById(id: string): Promise<MasterWine | null> {
  return withCache(`master_wine_${id}`, CACHE_TTL, async () => {
    try {
      const data = await apiFetch(`/wines/${id}`);
      return data as MasterWine;
    } catch {
      return null;
    }
  });
}

export function invalidateMasterWinesCache() {
  invalidatePrefix("master_wines");
  invalidatePrefix("master_wine_");
}
