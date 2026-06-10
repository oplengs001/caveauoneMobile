import { db } from "@/lib/firebase";
import { logActivity } from "@/lib/utils/activityLogger";
import { PulloutRequest } from "@/types";
import { addDoc, collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { invalidatePrefix } from "./cache";

export async function getPulloutRequests(
  filters: { sourceStoreId?: string; status?: string | string[] },
  pagination?: { limit: number }
): Promise<PulloutRequest[]> {
  let q: any = collection(db, "pullout_requests");

  if (filters.sourceStoreId) {
    q = query(q, where("sourceStoreId", "==", filters.sourceStoreId));
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
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PulloutRequest, 'id'>) } as PulloutRequest));
}

export async function createPulloutRequest(data: any, logData?: any) {
  const docRef = await addDoc(collection(db, "pullout_requests"), data);
  if (logData) {
    await logActivity({
      ...logData,
      entityId: docRef.id
    });
  }
  invalidatePrefix("admin_dashboard");
  return docRef;
}

export async function updatePulloutRequest(id: string, data: any, logData?: any) {
  await updateDoc(doc(db, "pullout_requests", id), data);
  if (logData) {
    await logActivity(logData);
  }
  invalidatePrefix("admin_dashboard");
}
