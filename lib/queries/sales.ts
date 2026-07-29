import { apiFetch } from "@/lib/api";

export async function getSalesByPeriod(storeId: string, periodStart: Date, periodEnd: Date) {
  const params = new URLSearchParams({
    storeId,
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
    aggregate: "true",
  });
  const data = await apiFetch(`/sales?${params}`);
  if (data.sales && Array.isArray(data.sales)) {
    const totalRevenue = data.sales.reduce((sum: number, item: any) => sum + (item.totalAmount || item.price || 0), 0);
    return {
      totalRevenue,
      totalItems: data.sales.length,
    };
  }
  return {
    totalRevenue: data.totalRevenue ?? data.totalAmount ?? 0,
    totalItems: data.totalItems ?? data.count ?? 0,
  };
}

export async function getSalesByPeriodAllStores(periodStart: Date, periodEnd: Date) {
  const params = new URLSearchParams({
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
    aggregate: "true",
  });
  const data = await apiFetch(`/sales?${params}`);
  if (data.sales && Array.isArray(data.sales)) {
    const totalRevenue = data.sales.reduce((sum: number, item: any) => sum + (item.totalAmount || item.price || 0), 0);
    return {
      totalRevenue,
      totalItems: data.sales.length,
    };
  }
  return {
    totalRevenue: data.totalRevenue ?? data.totalAmount ?? 0,
    totalItems: data.totalItems ?? data.count ?? 0,
  };
}
