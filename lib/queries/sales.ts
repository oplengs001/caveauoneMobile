import { collection, query, where, getAggregateFromServer, sum, count } from "firebase/firestore";
import { db } from "@/lib/firebase";

export async function getSalesByPeriod(storeId: string, periodStart: Date, periodEnd: Date) {
  const q = query(
    collection(db, "sales"),
    where("storeId", "==", storeId),
    where("soldAt", ">=", periodStart),
    where("soldAt", "<=", periodEnd)
  );
  
  const snapshot = await getAggregateFromServer(q, {
    totalRevenue: sum("totalAmount"),
    totalItems: count()
  });
  
  return {
    totalRevenue: snapshot.data().totalRevenue,
    totalItems: snapshot.data().totalItems
  };
}
