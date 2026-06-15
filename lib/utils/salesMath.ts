/**
 * Computes the overall aggregates for a dashboard view.
 * @param subtotal Total of all sales price (sum of `price` field)
 * @param grossRevenue Total of all sales amounts (sum of `totalAmount` field)
 * @param totalCost Total of all master wine prices (sum of `masterWinePrice` field)
 * @returns Object containing computed metrics
 */
export function calculateDashboardSalesMetrics(subtotal: number, grossRevenue: number, totalCost: number) {
  const netProfit = subtotal - totalCost;
  const vatAmount = grossRevenue - subtotal;
  const overallProfitMargin = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;

  return {
    netProfit,
    vatAmount,
    overallProfitMargin
  };
}

/**
 * Computes metrics for an individual sale item row.
 * @param totalPrice Total sale price for this line item (e.g., sale.totalPrice or sale.price * qty)
 * @param unitCost Cost per unit (master wine price)
 * @param quantity Number of units sold
 * @returns Object containing computed row metrics
 */
export function calculateRowSalesMetrics(totalPrice: number, unitCost: number, quantity: number) {
  const rowCost = unitCost * quantity;
  const itemProfit = totalPrice - rowCost;
  const profitMargin = rowCost > 0 ? (itemProfit / rowCost) * 100 : 0;
  const isProfitable = itemProfit >= 0;

  return {
    rowCost,
    itemProfit,
    profitMargin,
    isProfitable
  };
}
