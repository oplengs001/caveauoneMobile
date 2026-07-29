import { getMasterWines, getMasterWineById } from '../masterWines';
import { apiFetch } from '@/lib/api';

jest.mock('../cache', () => ({
  withCache: jest.fn(async (_k: string, _t: number, f: () => Promise<unknown>) => f()),
  invalidatePrefix: jest.fn(),
}));

const mockWines = [
  { id: 'wine-1', name: 'Chateau Margaux', vintage: '2018', producer: 'Margaux Estate' },
  { id: 'wine-2', name: 'Barolo DOCG', vintage: '2017', producer: 'Giacomo Conterno' },
  { id: 'wine-3', name: 'Opus One', vintage: '2019', producer: 'Mondavi-Rothschild' },
];

describe('masterWines queries', () => {
  describe('getMasterWines', () => {
    it('returns mapped wine list', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wines: [...mockWines] });

      const result = await getMasterWines();

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ id: 'wine-2', name: 'Barolo DOCG' }); // Sorted by name
    });

    it('does not apply name sort when orderByName is false', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wines: [...mockWines] });

      const result = await getMasterWines(false);

      expect(result[0]).toMatchObject({ id: 'wine-1', name: 'Chateau Margaux' });
    });

    it('applies limit when limitCount is provided', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wines: mockWines.slice(0, 2) });

      await getMasterWines(true, 2);

      expect(apiFetch).toHaveBeenCalledWith('/wines?limit=2');
    });

    it('returns empty array when no wines exist', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wines: [] });
      const result = await getMasterWines();
      expect(result).toHaveLength(0);
    });
  });

  describe('getMasterWineById', () => {
    it('returns the wine when it exists', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'wine-1', name: 'Chateau Margaux', vintage: '2018', producer: 'Margaux Estate' });

      const result = await getMasterWineById('wine-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('wine-1');
      expect(result?.name).toBe('Chateau Margaux');
    });

    it('returns null when the wine does not exist', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(new Error('Not found'));

      const result = await getMasterWineById('nonexistent-id');

      expect(result).toBeNull();
    });
  });
});
