import { getStores, getStoreById, getLocations } from '../stores';
import { getDocs, getDoc, where } from 'firebase/firestore';

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
});

const makeDocSnap = (id: string, data: Record<string, any> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

const mockStores = [
  { id: 'store-1', name: 'Wine Cellar BGC', type: 'Store' },
  { id: 'store-2', name: 'Alabang Outlet', type: 'Store' },
  { id: 'wh-1', name: 'Main Warehouse', type: 'Warehouse' },
];

const mockLocations = [
  { id: 'loc-1', name: 'Bin A1', capacity: 12 },
  { id: 'loc-2', name: 'Bin B2', capacity: 6 },
];

describe('stores queries', () => {
  describe('getStores', () => {
    it('returns all stores sorted by name when no type filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockStores));

      const result = await getStores();

      expect(result).toHaveLength(3);
      // Should be sorted alphabetically
      expect(result[0].name).toBe('Alabang Outlet');
      expect(result[1].name).toBe('Main Warehouse');
      expect(result[2].name).toBe('Wine Cellar BGC');
    });

    it('applies type filter when provided', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockStores[0], mockStores[1]]));

      await getStores('Store');

      expect(where).toHaveBeenCalledWith('type', '==', 'Store');
    });

    it('returns only warehouse stores when type is Warehouse', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockStores[2]]));

      const result = await getStores('Warehouse');

      expect(where).toHaveBeenCalledWith('type', '==', 'Warehouse');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Main Warehouse');
    });
  });

  describe('getStoreById', () => {
    it('returns the store when it exists', async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        makeDocSnap('store-1', { name: 'Wine Cellar BGC', type: 'Store' })
      );

      const result = await getStoreById('store-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('store-1');
      expect(result?.name).toBe('Wine Cellar BGC');
    });

    it('returns null when the store does not exist', async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(makeDocSnap('unknown', null));

      const result = await getStoreById('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('getLocations', () => {
    it('returns mapped locations', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockLocations));

      const result = await getLocations();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'loc-1', name: 'Bin A1' });
    });

    it('returns empty array when no locations exist', async () => {
      const result = await getLocations();
      expect(result).toHaveLength(0);
    });
  });
});
