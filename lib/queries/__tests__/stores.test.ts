import { getStores, getStoreById, getLocations } from '../stores';
import { apiFetch } from '@/lib/api';

jest.mock('../cache', () => ({
  withCache: jest.fn(async (_k: string, _t: number, f: () => Promise<unknown>) => f()),
  invalidatePrefix: jest.fn(),
}));

const getMockStores = () => [
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
      (apiFetch as jest.Mock).mockResolvedValueOnce({ stores: getMockStores() });

      const result = await getStores();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Alabang Outlet');
      expect(result[1].name).toBe('Main Warehouse');
      expect(result[2].name).toBe('Wine Cellar BGC');
    });

    it('applies type filter when provided', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ stores: getMockStores().slice(0, 2) });

      await getStores('Store');

      expect(apiFetch).toHaveBeenCalledWith('/stores?type=Store');
    });

    it('returns only warehouse stores when type is Warehouse', async () => {
      const mock = getMockStores();
      (apiFetch as jest.Mock).mockResolvedValueOnce({ stores: [mock[2]] });

      const result = await getStores('Warehouse');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Main Warehouse');
    });
  });

  describe('getStoreById', () => {
    it('returns the store when it exists', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'store-1', name: 'Wine Cellar BGC', type: 'Store' });

      const result = await getStoreById('store-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('store-1');
      expect(result?.name).toBe('Wine Cellar BGC');
    });

    it('returns null when the store does not exist', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      const result = await getStoreById('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('getLocations', () => {
    it('returns mapped locations', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ locations: mockLocations });

      const result = await getLocations();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Bin A1');
    });

    it('returns empty array when no locations exist', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ locations: [] });

      const result = await getLocations();

      expect(result).toHaveLength(0);
    });
  });
});
