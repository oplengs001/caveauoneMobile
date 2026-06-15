import { calculateDashboardSalesMetrics, calculateRowSalesMetrics } from '../salesMath';

describe('salesMath', () => {
  describe('calculateDashboardSalesMetrics', () => {
    it('calculates metrics correctly for profitable sales', () => {
      // subtotal: 1000, grossRevenue: 1200 (20% vat), totalCost: 500
      const result = calculateDashboardSalesMetrics(1000, 1200, 500);
      
      expect(result.netProfit).toBe(500); // 1000 - 500
      expect(result.vatAmount).toBe(200); // 1200 - 1000
      expect(result.overallProfitMargin).toBe(100); // (500 / 500) * 100
    });

    it('calculates metrics correctly for loss sales', () => {
      // subtotal: 400, grossRevenue: 480, totalCost: 500
      const result = calculateDashboardSalesMetrics(400, 480, 500);
      
      expect(result.netProfit).toBe(-100); // 400 - 500
      expect(result.vatAmount).toBe(80); // 480 - 400
      expect(result.overallProfitMargin).toBe(-20); // (-100 / 500) * 100
    });

    it('handles zero cost without dividing by zero', () => {
      const result = calculateDashboardSalesMetrics(1000, 1200, 0);
      
      expect(result.netProfit).toBe(1000);
      expect(result.overallProfitMargin).toBe(0); // Protect against Infinity
    });
  });

  describe('calculateRowSalesMetrics', () => {
    it('calculates row metrics correctly for profitable items', () => {
      // totalPrice: 300, unitCost: 100, quantity: 2
      const result = calculateRowSalesMetrics(300, 100, 2);
      
      expect(result.rowCost).toBe(200); // 100 * 2
      expect(result.itemProfit).toBe(100); // 300 - 200
      expect(result.profitMargin).toBe(50); // (100 / 200) * 100
      expect(result.isProfitable).toBe(true);
    });

    it('calculates row metrics correctly for loss items', () => {
      // totalPrice: 150, unitCost: 100, quantity: 2
      const result = calculateRowSalesMetrics(150, 100, 2);
      
      expect(result.rowCost).toBe(200); // 100 * 2
      expect(result.itemProfit).toBe(-50); // 150 - 200
      expect(result.profitMargin).toBe(-25); // (-50 / 200) * 100
      expect(result.isProfitable).toBe(false);
    });

    it('calculates row metrics correctly for break-even items', () => {
      // totalPrice: 200, unitCost: 100, quantity: 2
      const result = calculateRowSalesMetrics(200, 100, 2);
      
      expect(result.itemProfit).toBe(0);
      expect(result.profitMargin).toBe(0);
      expect(result.isProfitable).toBe(true); // 0 is considered profitable (not a loss)
    });

    it('handles zero unit cost', () => {
      const result = calculateRowSalesMetrics(300, 0, 2);
      
      expect(result.rowCost).toBe(0);
      expect(result.itemProfit).toBe(300);
      expect(result.profitMargin).toBe(0); // Protect against Infinity
      expect(result.isProfitable).toBe(true);
    });
  });
});
