import { apiFetch } from "@/lib/api";
import { StoreWineSetting } from "@/types";

export async function getStoreWineSettings(filters?: { storeId?: string; masterWineId?: string; discontinued?: boolean }): Promise<StoreWineSetting[]> {
  const params = new URLSearchParams();
  if (filters?.storeId) params.set("storeId", filters.storeId);
  if (filters?.masterWineId) params.set("masterWineId", filters.masterWineId);
  if (filters?.discontinued !== undefined) params.set("discontinued", String(filters.discontinued));
  const data = await apiFetch(`/stock-settings?${params}`);
  return (data.settings || data) as StoreWineSetting[];
}

export async function upsertStoreWineSetting(storeId: string, wineId: string, data: Partial<StoreWineSetting>) {
  await apiFetch("/stock-settings", {
    method: "POST",
    body: JSON.stringify({ storeId, masterWineId: wineId, ...data }),
  });
}
