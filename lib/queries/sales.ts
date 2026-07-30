import { apiFetch } from "@/lib/api";

export async function getSalesByPeriod(storeId: string, periodStart: Date, periodEnd: Date) {
  const params = new URLSearchParams({
    storeId,
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
    aggregate: "true",
  });
  const data = await apiFetch(`/sales?${params}`);

  if (Array.isArray(data)) {
    const totalRevenue = data.reduce(
      (sum: number, item: any) => sum + Number(item.totalAmount || item.price || 0),
      0
    );
    return {
      totalRevenue,
      totalItems: data.length,
    };
  }

  if (data.sales && Array.isArray(data.sales)) {
    const totalRevenue = Number(data.totalRevenue) || data.sales.reduce(
      (sum: number, item: any) => sum + Number(item.totalAmount || item.price || 0),
      0
    );
    return {
      totalRevenue,
      totalItems: Number(data.totalItems) || data.sales.length,
    };
  }

  return {
    totalRevenue: Number(data.totalRevenue ?? data.totalAmount ?? 0),
    totalItems: Number(data.totalItems ?? data.count ?? 0),
  };
}

export async function getSalesByPeriodAllStores(periodStart: Date, periodEnd: Date) {
  const params = new URLSearchParams({
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
    aggregate: "true",
  });
  const data = await apiFetch(`/sales?${params}`);

  if (Array.isArray(data)) {
    const totalRevenue = data.reduce(
      (sum: number, item: any) => sum + Number(item.totalAmount || item.price || 0),
      0
    );
    return {
      totalRevenue,
      totalItems: data.length,
    };
  }

  if (data.sales && Array.isArray(data.sales)) {
    const totalRevenue = Number(data.totalRevenue) || data.sales.reduce(
      (sum: number, item: any) => sum + Number(item.totalAmount || item.price || 0),
      0
    );
    return {
      totalRevenue,
      totalItems: data.sales.length,
    };
  }

  return {
    totalRevenue: Number(data.totalRevenue ?? data.totalAmount ?? 0),
    totalItems: Number(data.totalItems ?? data.count ?? 0),
  };
}
