import { collection, doc, getDoc, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Store, Location } from "@/types";
import { withCache, invalidatePrefix } from "./cache";

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function getStores(type?: "Store" | "Warehouse"): Promise<Store[]> {
  const cacheKey = `stores_list_${type || "all"}`;
  return withCache(cacheKey, CACHE_TTL, async () => {
    let q: any = collection(db, "stores");
    if (type) {
      q = query(q, where("type", "==", type));
    }
    const snap = await getDocs(q);
    const stores = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Store, 'id'>) } as Store));
    return stores.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  });
}

export async function getStoreById(id: string): Promise<Store | null> {
  return withCache(`store_${id}`, CACHE_TTL, async () => {
    const snap = await getDoc(doc(db, "stores", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Store;
  });
}

// Storage Units (locations collection)
export async function getLocations(): Promise<Location[]> {
  const cacheKey = `locations_list`;
  return withCache(cacheKey, CACHE_TTL, async () => {
    const q = query(collection(db, "locations"), orderBy("name", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Location, 'id'>) } as Location));
  });
}

export function invalidateStoresCache() {
  invalidatePrefix("stores_");
}

export function invalidateLocationsCache() {
  invalidatePrefix("locations_");
}
