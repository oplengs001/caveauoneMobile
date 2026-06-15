import {
  getReceivedAndShelvedBottles,
  countBottlesByWineAndStore,
  countBottlesByWine,
  getBottlesByWine,
  batchCountBottles,
} from '../inventoryBottles';
import { getDocs, getCountFromServer, where, limit } from 'firebase/firestore';

// Clear module-level cache between tests by bypassing it entirely
jest.mock('../cache', () => ({
  withCache: jest.fn(async (_k: string, _t: number, f: () => Promise<unknown>) => f()),
  invalidatePrefix: jest.fn(),
}));

const makeDocs = (items: Array<{ id: string; [key: string]: any }>) => ({
  docs: items.map((item) => ({
    id: item.id,
    data: () => { const { id: _id, ...rest } = item; return rest; },
    exists: () => true,
  })),
  empty: items.length === 0,
  size: items.length,
});

describe('inventoryBottles queries', () => {
  describe('getReceivedAndShelvedBottles', () => {
    it('returns mapped bottles from snapshot', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(
        makeDocs([
          { id: 'bottle-1', masterWineId: 'wine-1', status: 'shelved', binCode: 'A1' },
          { id: 'bottle-2', masterWineId: 'wine-2', status: 'received', binCode: 'B2' },
        ])
      );

      const result = await getReceivedAndShelvedBottles();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 'bottle-1', masterWineId: 'wine-1', status: 'shelved', binCode: 'A1' });
      expect(result[1]).toEqual({ id: 'bottle-2', masterWineId: 'wine-2', status: 'received', binCode: 'B2' });
    });

    it('returns empty array when no bottles exist', async () => {
      const result = await getReceivedAndShelvedBottles();
      expect(result).toHaveLength(0);
    });

    it('applies correct status filter', async () => {
      await getReceivedAndShelvedBottles();
      expect(where).toHaveBeenCalledWith('status', 'in', ['received', 'shelved']);
    });
  });

  describe('countBottlesByWineAndStore', () => {
    it('returns count from getCountFromServer', async () => {
      (getCountFromServer as jest.Mock).mockResolvedValueOnce({ data: () => ({ count: 12 }) });

      const result = await countBottlesByWineAndStore('mock-wine-ref' as any, 'mock-store-ref' as any, ['shelved']);

      expect(result).toBe(12);
    });

    it('filters by storeRef, masterWineRef and statuses', async () => {
      (getCountFromServer as jest.Mock).mockResolvedValueOnce({ data: () => ({ count: 3 }) });

      await countBottlesByWineAndStore('wine-ref' as any, 'store-ref' as any, ['shelved', 'received']);

      expect(where).toHaveBeenCalledWith('storeRef', '==', 'store-ref');
      expect(where).toHaveBeenCalledWith('masterWineRef', '==', 'wine-ref');
      expect(where).toHaveBeenCalledWith('status', 'in', ['shelved', 'received']);
    });
  });

  describe('countBottlesByWine', () => {
    it('returns count for a given wine across all stores', async () => {
      (getCountFromServer as jest.Mock).mockResolvedValueOnce({ data: () => ({ count: 7 }) });

      const result = await countBottlesByWine('wine-ref' as any, ['shelved']);

      expect(result).toBe(7);
      expect(where).toHaveBeenCalledWith('masterWineRef', '==', 'wine-ref');
    });
  });

  describe('getBottlesByWine', () => {
    it('returns bottles matching wine and statuses', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(
        makeDocs([{ id: 'b-1', masterWineId: 'wine-1', status: 'shelved' }])
      );

      const result = await getBottlesByWine('wine-ref' as any, ['shelved']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('b-1');
    });

    it('applies storeRef filter when provided', async () => {
      await getBottlesByWine('wine-ref' as any, ['shelved'], 'store-ref' as any);
      expect(where).toHaveBeenCalledWith('storeRef', '==', 'store-ref');
    });

    it('applies limit when provided', async () => {
      await getBottlesByWine('wine-ref' as any, ['shelved'], undefined, 10);
      expect(limit).toHaveBeenCalledWith(10);
    });
  });

  describe('batchCountBottles', () => {
    it('executes parallel count queries and returns results array', async () => {
      (getCountFromServer as jest.Mock)
        .mockResolvedValueOnce({ data: () => ({ count: 5 }) })
        .mockResolvedValueOnce({ data: () => ({ count: 3 }) });

      const result = await batchCountBottles(
        [
          { wineRef: 'wine-1' as any, storeRef: 'store-1' as any },
          { wineRef: 'wine-2' as any, storeRef: 'store-1' as any },
        ],
        ['shelved']
      );

      expect(result).toEqual([5, 3]);
    });
  });
});
