import { apiFetch } from "@/lib/api";
import { PulloutRequest } from "@/types";
import { logActivity } from "@/lib/utils/activityLogger";
import { invalidatePrefix } from "./cache";

export async function getPulloutRequests(
  filters: { sourceStoreId?: string; status?: string | string[] },
  pagination?: { limit: number }
): Promise<PulloutRequest[]> {
  const params = new URLSearchParams();
  if (filters.sourceStoreId) params.set("sourceStoreId", filters.sourceStoreId);
  if (filters.status) {
    params.set("status", Array.isArray(filters.status) ? filters.status.join(",") : filters.status);
  }
  if (pagination?.limit) params.set("limit", String(pagination.limit));
  const data = await apiFetch(`/pullout-requests?${params}`);
  return (data.pulloutRequests || data) as PulloutRequest[];
}

export async function createPulloutRequest(data: any, logData?: any) {
  const result = await apiFetch("/pullout-requests", {
    method: "POST",
    body: JSON.stringify(data),
  });
  const id = typeof result === "string" ? result : (result?.id || result);
  if (logData) {
    await logActivity({
      action: "PULLOUT_COMPLETED",
      entity: "pullout_requests",
      entityId: id,
      summary: logData.summary || `Created pullout request ${id}`,
      performedBy: logData.performedBy || "unknown",
      performedByRole: logData.performedByRole || "warehouse",
      source: logData.source || "warehouse",
    });
  }
  invalidatePrefix("admin_dashboard");
  return id;
}

export async function updatePulloutRequest(id: string, data: any, logData?: any) {
  await apiFetch(`/pullout-requests/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (logData) {
    await logActivity({
      action: "PULLOUT_COMPLETED",
      entity: "pullout_requests",
      entityId: id,
      summary: logData.summary || `Updated pullout request ${id}`,
      performedBy: logData.performedBy || "unknown",
      performedByRole: logData.performedByRole || "warehouse",
      source: logData.source || "warehouse",
    });
  }
  invalidatePrefix("admin_dashboard");
}
