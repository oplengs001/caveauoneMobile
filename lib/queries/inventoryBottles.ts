import { db } from "@/lib/firebase";
import { collection, doc, DocumentReference, getCountFromServer, getDocs, limit, query, where } from "firebase/firestore";
import { InventoryBottle } from "@/types";
import { withCache } from "./cache";

export async function getReceivedAndShelvedBottles(limitCount: number = 3000): Promise<InventoryBottle[]> {
  return withCache(`active_bottles_${limitCount}`, 2 * 60 * 1000, async () => {
    const q = query(
      collection(db, "inventory_bottles"),
      where("status", "in", ["received", "shelved"]),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InventoryBottle, 'id'>) } as InventoryBottle));
  });
}


export async function countBottlesByWineAndStore(
  wineRef: DocumentReference,
  storeRef: DocumentReference,
  statuses: string[]
): Promise<number> {
  const countSnap = await getCountFromServer(
    query(
      collection(db, "inventory_bottles"),
      where("storeRef", "==", storeRef),
      where("masterWineRef", "==", wineRef),
      where("status", "in", statuses)
    )
  );
  return countSnap.data().count;
}

export async function countBottlesByWine(
  wineRef: DocumentReference,
  statuses: string[]
): Promise<number> {
  const countSnap = await getCountFromServer(
    query(
      collection(db, "inventory_bottles"),
      where("masterWineRef", "==", wineRef),
      where("status", "in", statuses)
    )
  );
  return countSnap.data().count;
}

export async function getBottlesByWine(
  wineRef: DocumentReference,
  statuses: string[],
  storeRef?: DocumentReference,
  limitCount?: number
): Promise<InventoryBottle[]> {
  let q: any = query(
    collection(db, "inventory_bottles"),
    where("masterWineRef", "==", wineRef),
    where("status", "in", statuses)
  );
  if (storeRef) {
    q = query(q, where("storeRef", "==", storeRef));
  }
  if (limitCount) {
    q = query(q, limit(limitCount));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<InventoryBottle, 'id'>) } as InventoryBottle));
}

export async function batchCountBottles(
  pairs: { wineRef: DocumentReference; storeRef: DocumentReference }[],
  statuses: string[]
) {
  // Execute in parallel
  const results = await Promise.all(
    pairs.map(p => countBottlesByWineAndStore(p.wineRef, p.storeRef, statuses))
  );
  return results;
}

export async function countBottlesForStoreDashboard(
  storeRef: DocumentReference,
  settings: any[]
) {
  const pairs = settings.map(s => {
    // Determine the wine ID from the setting
    const wineId = s.masterWineId || s.wineId || (s.masterWineRef?.id) || (s.wineRef?.id);
    return {
      wineRef: doc(db, "master_wines", wineId),
      storeRef
    };
  });
  return batchCountBottles(pairs, ["shelved", "received"]);
}
