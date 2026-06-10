import { collection, doc, getDoc, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MasterWine } from "@/types";
import { withCache, invalidatePrefix } from "./cache";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getMasterWines(orderByName: boolean = true, limitCount?: number): Promise<MasterWine[]> {
  const cacheKey = `master_wines_${orderByName}_${limitCount || 'all'}`;
  return withCache(cacheKey, CACHE_TTL, async () => {
    let q: any = collection(db, "master_wines");
    if (orderByName) {
      q = query(q, orderBy("name", "asc"));
    }
    if (limitCount) {
      q = query(q, limit(limitCount));
    }
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MasterWine, 'id'>) } as MasterWine));
  });
}

export async function getMasterWineById(id: string): Promise<MasterWine | null> {
  return withCache(`master_wine_${id}`, CACHE_TTL, async () => {
    const snap = await getDoc(doc(db, "master_wines", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as MasterWine;
  });
}

export function invalidateMasterWinesCache() {
  invalidatePrefix("master_wines");
  invalidatePrefix("master_wine_");
}
