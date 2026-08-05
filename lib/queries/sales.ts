import { apiFetch } from "@/lib/api";

export async function getSalesByPeriod(storeId: string, periodStart: Date, periodEnd: Date) {
  const params = new URLSearchParams({
    storeId,
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
  });
  const data = await apiFetch(`/sales?${params}`);

  const salesList = Array.isArray(data) ? data : Array.isArray(data.sales) ? data.sales : [];
  let totalRevenue = 0;
  let totalVolume = 0;

  salesList.forEach((item: any) => {
    totalRevenue += Number(item.totalAmount || item.price || 0);
    if (item.saleType === "glass") {
      totalVolume += 1 / 6;
    } else if (item.saleType === "carafe") {
      totalVolume += 2 / 6;
    } else {
      totalVolume += Number(item.quantity || 1);
    }
  });

  const roundedVolume = Math.round(totalVolume * 100) / 100;

  return {
    totalRevenue: Number(data.totalRevenue ?? totalRevenue),
    totalItems: roundedVolume,
  };
}

export async function getSalesByPeriodAllStores(periodStart: Date, periodEnd: Date) {
  const params = new URLSearchParams({
    from: periodStart.toISOString(),
    to: periodEnd.toISOString(),
  });
  const data = await apiFetch(`/sales?${params}`);

  const salesList = Array.isArray(data) ? data : Array.isArray(data.sales) ? data.sales : [];
  let totalRevenue = 0;
  let totalVolume = 0;

  salesList.forEach((item: any) => {
    totalRevenue += Number(item.totalAmount || item.price || 0);
    if (item.saleType === "glass") {
      totalVolume += 1 / 6;
    } else if (item.saleType === "carafe") {
      totalVolume += 2 / 6;
    } else {
      totalVolume += Number(item.quantity || 1);
    }
  });

  const roundedVolume = Math.round(totalVolume * 100) / 100;

  return {
    totalRevenue: Number(data.totalRevenue ?? totalRevenue),
    totalItems: roundedVolume,
  };
}
