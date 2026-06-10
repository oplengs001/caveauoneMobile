import { collection, query, where, getAggregateFromServer, sum, count } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getSalesByPeriod(storeId: string, periodStart: Date, periodEnd: Date) {
  const q = query(
    collection(db, "sales"),
    where("storeId", "==", storeId),
    where("createdAt", ">=", periodStart),
    where("createdAt", "<=", periodEnd)
  );
  
  const snapshot = await getAggregateFromServer(q, {
    totalRevenue: sum("price"),
    totalItems: count()
  });
  
  return {
    totalRevenue: snapshot.data().totalRevenue,
    totalItems: snapshot.data().totalItems
  };
}
