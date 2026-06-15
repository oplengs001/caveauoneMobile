import { getSalesByPeriod } from '../sales';
import { getAggregateFromServer, where } from 'firebase/firestore';

describe('sales queries', () => {
  describe('getSalesByPeriod', () => {
    const storeId = 'store-1';
    const start = new Date('2025-01-01T00:00:00.000Z');
    const end = new Date('2025-01-31T23:59:59.999Z');

    it('returns aggregated revenue and item count', async () => {
      (getAggregateFromServer as jest.Mock).mockResolvedValueOnce({
        data: () => ({ totalRevenue: 15000, totalItems: 42 }),
      });

      const result = await getSalesByPeriod(storeId, start, end);

      expect(result.totalRevenue).toBe(15000);
      expect(result.totalItems).toBe(42);
    });

    it('filters by storeId', async () => {
      await getSalesByPeriod(storeId, start, end);

      expect(where).toHaveBeenCalledWith('storeId', '==', storeId);
    });

    it('filters by date range using soldAt field', async () => {
      await getSalesByPeriod(storeId, start, end);

      expect(where).toHaveBeenCalledWith('soldAt', '>=', start);
      expect(where).toHaveBeenCalledWith('soldAt', '<=', end);
    });

    it('returns zero values when no sales exist in period', async () => {
      const result = await getSalesByPeriod(storeId, start, end);

      expect(result.totalRevenue).toBe(0);
      expect(result.totalItems).toBe(0);
    });
  });
});
