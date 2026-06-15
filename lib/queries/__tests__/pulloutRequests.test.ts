import { getPulloutRequests, createPulloutRequest, updatePulloutRequest } from '../pulloutRequests';
import { getDocs, addDoc, updateDoc, doc, where, limit, orderBy } from 'firebase/firestore';
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

const mockPullouts = [
  { id: 'po-1', sourceStoreId: 'warehouse-1', status: 'pending', items: [] },
  { id: 'po-2', sourceStoreId: 'warehouse-1', status: 'in_progress', items: [] },
];

describe('pulloutRequests queries', () => {
  describe('getPulloutRequests', () => {
    it('returns mapped pullout requests', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockPullouts));

      const result = await getPulloutRequests({});

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'po-1', status: 'pending' });
    });

    it('applies sourceStoreId filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockPullouts[0]]));

      await getPulloutRequests({ sourceStoreId: 'warehouse-1' });

      expect(where).toHaveBeenCalledWith('sourceStoreId', '==', 'warehouse-1');
    });

    it('applies single status filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockPullouts[0]]));

      await getPulloutRequests({ status: 'pending' });

      expect(where).toHaveBeenCalledWith('status', '==', 'pending');
    });

    it('applies array status filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockPullouts));

      await getPulloutRequests({ status: ['pending', 'in_progress'] });

      expect(where).toHaveBeenCalledWith('status', 'in', ['pending', 'in_progress']);
    });

    it('applies pagination limit', async () => {
      await getPulloutRequests({}, { limit: 10 });

      expect(limit).toHaveBeenCalledWith(10);
    });

    it('orders by createdAt desc', async () => {
      await getPulloutRequests({});

      expect(orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });
  });

  describe('createPulloutRequest', () => {
    it('calls addDoc and returns the new doc reference', async () => {
      (addDoc as jest.Mock).mockResolvedValueOnce({ id: 'new-po-id' });

      const result = await createPulloutRequest({ status: 'pending', items: [] });

      expect(addDoc).toHaveBeenCalled();
      expect(result).toEqual({ id: 'new-po-id' });
    });

    it('calls logActivity with entityId from the new doc', async () => {
      (addDoc as jest.Mock).mockResolvedValueOnce({ id: 'new-po-id' });

      const logData = {
        action: 'PULLOUT_COMPLETED',
        entity: 'pullout_requests',
        entityId: '',
        summary: 'Pullout created',
        performedBy: 'user@test.com',
        performedByRole: 'warehouse',
        source: 'warehouse' as const,
      };

      await createPulloutRequest({ status: 'pending' }, logData);

      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'new-po-id' })
      );
    });

    it('does NOT call logActivity when logData is omitted', async () => {
      await createPulloutRequest({ status: 'pending' });

      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe('updatePulloutRequest', () => {
    it('calls updateDoc on the correct document', async () => {
      await updatePulloutRequest('po-1', { status: 'completed' });

      expect(doc).toHaveBeenCalledWith(expect.anything(), 'pullout_requests', 'po-1');
      expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { status: 'completed' });
    });

    it('calls logActivity when logData is provided', async () => {
      const logData = {
        action: 'PULLOUT_COMPLETED',
        entity: 'pullout_requests',
        entityId: 'po-1',
        summary: 'Pullout completed',
        performedBy: 'user@test.com',
        performedByRole: 'warehouse',
        source: 'warehouse' as const,
      };

      await updatePulloutRequest('po-1', { status: 'completed' }, logData);

      expect(logActivity).toHaveBeenCalledWith(logData);
    });

    it('invalidates admin dashboard cache on update', async () => {
      const { invalidatePrefix } = require('../cache');

      await updatePulloutRequest('po-1', { status: 'completed' });

      expect(invalidatePrefix).toHaveBeenCalledWith('admin_dashboard');
    });
  });
});
