import { db } from "@/lib/firebase";
import { logActivity } from "@/lib/utils/activityLogger";
import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { WineRequest } from "@/types";
import { invalidatePrefix } from "./cache";

export async function getWineRequests(
  filters: { storeId?: string; status?: string | string[] },
  pagination?: { limit: number }
): Promise<WineRequest[]> {
  let q: any = collection(db, "wine_requests");

  if (filters.storeId) {
    q = query(q, where("storeId", "==", filters.storeId));
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      q = query(q, where("status", "in", filters.status));
    } else {
      q = query(q, where("status", "==", filters.status));
    }
  }

  q = query(q, orderBy("createdAt", "desc"));

  if (pagination?.limit) {
    q = query(q, limit(pagination.limit));
  }

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<WineRequest, 'id'>) } as WineRequest));
}

export async function updateWineRequest(id: string, data: any, logData?: any) {
  await updateDoc(doc(db, "wine_requests", id), data);
  if (logData) {
    await logActivity(logData);
  }
  invalidatePrefix("admin_dashboard"); // invalidate admin dashboard cache
}
