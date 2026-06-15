import { getWineRequests, updateWineRequest } from '../wineRequests';
import { getDocs, updateDoc, doc, where, limit, orderBy } from 'firebase/firestore';
import { logActivity } from '@/lib/utils/activityLogger';

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

const mockWineRequests = [
  { id: 'req-1', storeId: 'store-a', status: 'pending', totalAmount: 500, items: [] },
  { id: 'req-2', storeId: 'store-b', status: 'converted', totalAmount: 200, items: [] },
];

describe('wineRequests queries', () => {
  describe('getWineRequests', () => {
    it('returns all requests when no filters provided', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockWineRequests));

      const result = await getWineRequests({});

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('req-1');
      expect(result[1].id).toBe('req-2');
    });

    it('applies storeId filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockWineRequests[0]]));

      await getWineRequests({ storeId: 'store-a' });

      expect(where).toHaveBeenCalledWith('storeId', '==', 'store-a');
    });

    it('applies single status filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockWineRequests[0]]));

      await getWineRequests({ status: 'pending' });

      expect(where).toHaveBeenCalledWith('status', '==', 'pending');
    });

    it('applies array status filter using `in` operator', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockWineRequests));

      await getWineRequests({ status: ['pending', 'converted'] });

      expect(where).toHaveBeenCalledWith('status', 'in', ['pending', 'converted']);
    });

    it('applies pagination limit', async () => {
      await getWineRequests({}, { limit: 5 });

      expect(limit).toHaveBeenCalledWith(5);
    });

    it('orders by createdAt desc', async () => {
      await getWineRequests({});

      expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('returns empty array when no results', async () => {
      const result = await getWineRequests({ status: 'pending' });

      expect(result).toHaveLength(0);
    });
  });

  describe('updateWineRequest', () => {
    it('calls updateDoc with correct document reference and data', async () => {
      await updateWineRequest('req-1', { status: 'converted' });

      expect(doc).toHaveBeenCalledWith(expect.anything(), 'wine_requests', 'req-1');
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: 'converted' }
      );
    });

    it('calls logActivity when logData is provided', async () => {
      const logData = {
        action: 'WINE_REQUEST_CREATED',
        entity: 'wine_requests',
        entityId: 'req-1',
        summary: 'Test',
        performedBy: 'user@test.com',
        performedByRole: 'store',
        source: 'store' as const,
      };

      await updateWineRequest('req-1', { status: 'converted' }, logData);

      expect(logActivity).toHaveBeenCalledWith(logData);
    });

    it('does NOT call logActivity when logData is omitted', async () => {
      await updateWineRequest('req-1', { status: 'rejected' });

      expect(logActivity).not.toHaveBeenCalled();
    });
  });
});
