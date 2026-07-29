import { getSalesByPeriod } from '../sales';
import { apiFetch } from '@/lib/api';

describe('sales queries', () => {
  describe('getSalesByPeriod', () => {
    const storeId = 'store-1';
    const start = new Date('2025-01-01T00:00:00.000Z');
    const end = new Date('2025-01-31T23:59:59.999Z');

    it('returns aggregated revenue and item count', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        sales: [
          { storeId: 'store-1', totalAmount: 10000, soldAt: '2025-01-10T10:00:00.000Z' },
          { storeId: 'store-1', totalAmount: 5000, soldAt: '2025-01-15T10:00:00.000Z' },
        ],
      });

      const result = await getSalesByPeriod(storeId, start, end);

      expect(result.totalRevenue).toBe(15000);
      expect(result.totalItems).toBe(2);
    });

    it('filters by storeId and date range', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ sales: [] });

      await getSalesByPeriod(storeId, start, end);

      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/sales?storeId=store-1'));
    });

    it('returns zero values when no sales exist in period', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ sales: [] });

      const result = await getSalesByPeriod(storeId, start, end);

      expect(result.totalRevenue).toBe(0);
      expect(result.totalItems).toBe(0);
    });
  });
});
