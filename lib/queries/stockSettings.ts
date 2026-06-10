import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { StoreWineSetting } from "@/types";

export async function getStoreWineSettings(filters?: { storeId?: string; masterWineId?: string; discontinued?: boolean }): Promise<StoreWineSetting[]> {
  let q: any = collection(db, "store_wine_settings");
  
  if (filters?.storeId) {
    q = query(q, where("storeId", "==", filters.storeId));
  }
  if (filters?.masterWineId) {
    q = query(q, where("masterWineId", "==", filters.masterWineId));
  }
  if (filters?.discontinued !== undefined) {
    q = query(q, where("discontinued", "==", filters.discontinued));
  }
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<StoreWineSetting, 'id'>) } as StoreWineSetting));
}

export async function upsertStoreWineSetting(storeId: string, wineId: string, data: Partial<StoreWineSetting>) {
  const docId = `${storeId}_${wineId}`;
  await setDoc(doc(db, "store_wine_settings", docId), data, { merge: true });
}
