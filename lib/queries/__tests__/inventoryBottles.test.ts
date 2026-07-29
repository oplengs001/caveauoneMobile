import {
  getReceivedAndShelvedBottles,
  countBottlesByWineAndStore,
  countBottlesByWine,
  getBottlesByWine,
  batchCountBottles,
} from '../inventoryBottles';
import { apiFetch } from '@/lib/api';

jest.mock('../cache', () => ({
  withCache: jest.fn(async (_k: string, _t: number, f: () => Promise<unknown>) => f()),
}));

describe('inventoryBottles queries', () => {
  describe('getReceivedAndShelvedBottles', () => {
    it('returns active bottles list from apiFetch', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        bottles: [
          { id: 'b-1', status: 'received' },
          { id: 'b-2', status: 'shelved' },
        ],
      });

      const result = await getReceivedAndShelvedBottles(50);

      expect(result).toHaveLength(2);
      expect(apiFetch).toHaveBeenCalledWith('/bottles?status=received%2Cshelved&limit=50');
    });
  });

  describe('countBottlesByWineAndStore', () => {
    it('calls apiFetch countOnly', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ count: 3 });

      const result = await countBottlesByWineAndStore('wine-1', 'store-1', ['shelved', 'received']);

      expect(result).toBe(3);
      expect(apiFetch).toHaveBeenCalledWith('/bottles?masterWineId=wine-1&storeId=store-1&status=shelved%2Creceived&countOnly=true');
    });
  });

  describe('countBottlesByWine', () => {
    it('returns count for a given wine across all stores', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ count: 7 });

      const result = await countBottlesByWine('wine-1', ['shelved']);

      expect(result).toBe(7);
      expect(apiFetch).toHaveBeenCalledWith('/bottles?masterWineId=wine-1&status=shelved&countOnly=true');
    });
  });

  describe('getBottlesByWine', () => {
    it('returns bottles matching wine and statuses', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({
        bottles: [{ id: 'b-1', masterWineId: 'wine-1', status: 'shelved' }],
      });

      const result = await getBottlesByWine('wine-1', ['shelved']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b-1');
    });

    it('applies storeId filter when provided', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ bottles: [] });

      await getBottlesByWine('wine-1', ['shelved'], 'store-1');

      expect(apiFetch).toHaveBeenCalledWith('/bottles?masterWineId=wine-1&status=shelved&storeId=store-1');
    });

    it('applies limit when provided', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ bottles: [] });

      await getBottlesByWine('wine-1', ['shelved'], undefined, 10);

      expect(apiFetch).toHaveBeenCalledWith('/bottles?masterWineId=wine-1&status=shelved&limit=10');
    });
  });

  describe('batchCountBottles', () => {
    it('executes parallel count queries and returns results array', async () => {
      (apiFetch as jest.Mock)
        .mockResolvedValueOnce({ count: 5 })
        .mockResolvedValueOnce({ count: 3 });

      const result = await batchCountBottles(
        [
          { wineId: 'wine-1', storeId: 'store-1' },
          { wineId: 'wine-2', storeId: 'store-1' },
        ],
        ['shelved']
      );

      expect(result).toEqual([5, 3]);
    });
  });
});
