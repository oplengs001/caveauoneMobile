import { getMasterWines, getMasterWineById } from '../masterWines';
import { getDocs, getDoc, orderBy, limit } from 'firebase/firestore';

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

const mockWines = [
  { id: 'wine-1', name: 'Chateau Margaux', vintage: '2018', producer: 'Margaux Estate' },
  { id: 'wine-2', name: 'Barolo DOCG', vintage: '2017', producer: 'Giacomo Conterno' },
  { id: 'wine-3', name: 'Opus One', vintage: '2019', producer: 'Mondavi-Rothschild' },
];

describe('masterWines queries', () => {
  describe('getMasterWines', () => {
    it('returns mapped wine list', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockWines));

      const result = await getMasterWines();

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({ id: 'wine-1', name: 'Chateau Margaux' });
    });

    it('applies orderBy name when orderByName is true (default)', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockWines));

      await getMasterWines(true);

      expect(orderBy).toHaveBeenCalledWith('name', 'asc');
    });

    it('does not apply orderBy when orderByName is false', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockWines));

      await getMasterWines(false);

      expect(orderBy).not.toHaveBeenCalledWith('name', 'asc');
    });

    it('applies limit when limitCount is provided', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockWines.slice(0, 2)));

      await getMasterWines(true, 2);

      expect(limit).toHaveBeenCalledWith(2);
    });

    it('returns empty array when no wines exist', async () => {
      const result = await getMasterWines();
      expect(result).toHaveLength(0);
    });
  });

  describe('getMasterWineById', () => {
    it('returns the wine when it exists', async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(
        makeDocSnap('wine-1', { name: 'Chateau Margaux', vintage: '2018', producer: 'Margaux Estate' })
      );

      const result = await getMasterWineById('wine-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('wine-1');
      expect(result?.name).toBe('Chateau Margaux');
    });

    it('returns null when the wine does not exist', async () => {
      (getDoc as jest.Mock).mockResolvedValueOnce(makeDocSnap('unknown', null));

      const result = await getMasterWineById('nonexistent-id');

      expect(result).toBeNull();
    });
  });
});
