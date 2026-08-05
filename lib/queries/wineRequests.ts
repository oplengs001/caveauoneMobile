import { apiFetch } from "@/lib/api";
import { WineRequest } from "@/types";
import { logActivity } from "@/lib/utils/activityLogger";
import { invalidatePrefix } from "./cache";

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
  return (data.wineRequests || data) as WineRequest[];
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
