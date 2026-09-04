import { apiFetch } from "@/lib/api";
import { WineRequest } from "@/types";
import { logActivity } from "@/lib/utils/activityLogger";
import { invalidatePrefix } from "./cache";

const wineRequestDetailCache = new Map<string, WineRequest>();

export function setWineRequestInCache(req: WineRequest) {
  if (req && req.id) {
    wineRequestDetailCache.set(req.id, req);
  }
}

export function getWineRequestFromCache(id: string): WineRequest | undefined {
  return wineRequestDetailCache.get(id);
}

export async function getWineRequests(
  filters: { storeId?: string; status?: string | string[] },
  pagination?: { limit: number }
): Promise<WineRequest[]> {
  const params = new URLSearchParams();
  if (filters.storeId) params.set("storeId", filters.storeId);
  if (filters.status) {
    params.set("status", Array.isArray(filters.status) ? filters.status.join(",") : filters.status);
  }
  if (pagination?.limit) params.set("limit", String(pagination.limit));
  const data = await apiFetch(`/wine-requests?${params}`);
  const list = (data.wineRequests || data) as WineRequest[];
  if (Array.isArray(list)) {
    list.forEach(setWineRequestInCache);
  }
  return list;
}

export async function updateWineRequest(id: string, data: any, logData?: any) {
  await apiFetch(`/wine-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (logData) {
    await logActivity({
      action: "WINE_REQUEST_RECEIVING",
      entity: "wine_requests",
      entityId: id,
      summary: logData.summary || `Updated wine request ${id}`,
      performedBy: logData.performedBy || "unknown",
      performedByRole: logData.performedByRole || "store",
      source: logData.source || "store",
    });
  }
  invalidatePrefix("admin_dashboard");
}
