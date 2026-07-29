import { apiFetch } from "@/lib/api";
import { Store, Location } from "@/types";
import { withCache, invalidatePrefix } from "./cache";

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getStores(type?: "Store" | "Warehouse"): Promise<Store[]> {
  const cacheKey = `stores_list_${type || "all"}`;
  return withCache(cacheKey, CACHE_TTL, async () => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    const path = `/stores${params.toString() ? `?${params}` : ""}`;
    const data = await apiFetch(path);
    const stores: Store[] = data.stores || data;
    return stores.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  });
}

export async function getStoreById(id: string): Promise<Store | null> {
  return withCache(`store_${id}`, CACHE_TTL, async () => {
    try {
      const data = await apiFetch(`/stores/${id}`);
      return data as Store;
    } catch {
      return null;
    }
  });
}

// Storage Units (locations collection)
export async function getLocations(): Promise<Location[]> {
  const cacheKey = `locations_list`;
  return withCache(cacheKey, CACHE_TTL, async () => {
    const data = await apiFetch("/locations");
    const locations: Location[] = data.locations || data;
    return locations.sort((a: Location, b: Location) => (a.name || "").localeCompare(b.name || ""));
  });
}

export function invalidateStoresCache() {
  invalidatePrefix("stores_");
}

export function invalidateLocationsCache() {
  invalidatePrefix("locations_");
}
