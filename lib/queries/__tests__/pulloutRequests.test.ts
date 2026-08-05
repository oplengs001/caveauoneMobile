import { getPulloutRequests, createPulloutRequest, updatePulloutRequest } from '../pulloutRequests';
import { apiFetch } from '@/lib/api';
import { logActivity } from '@/lib/utils/activityLogger';

jest.mock('../cache', () => ({
  withCache: jest.fn(async (_k: string, _t: number, f: () => Promise<unknown>) => f()),
  invalidatePrefix: jest.fn(),
}));

const mockPullouts = [
  { id: 'po-1', sourceStoreId: 'warehouse-1', status: 'pending', items: [] },
  { id: 'po-2', sourceStoreId: 'warehouse-1', status: 'in_progress', items: [] },
];

describe('pulloutRequests queries', () => {
  describe('getPulloutRequests', () => {
    it('returns mapped pullout requests', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ pulloutRequests: mockPullouts });

      const result = await getPulloutRequests({});

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'po-1', status: 'pending' });
    });

    it('applies sourceStoreId filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ pulloutRequests: [mockPullouts[0]] });

      await getPulloutRequests({ sourceStoreId: 'warehouse-1' });

      expect(apiFetch).toHaveBeenCalledWith('/pullout-requests?sourceStoreId=warehouse-1');
    });

    it('applies status filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ pulloutRequests: [mockPullouts[0]] });

      await getPulloutRequests({ status: 'pending' });

      expect(apiFetch).toHaveBeenCalledWith('/pullout-requests?status=pending');
    });

    it('applies array status filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ pulloutRequests: mockPullouts });

      await getPulloutRequests({ status: ['pending', 'in_progress'] });

      expect(apiFetch).toHaveBeenCalledWith('/pullout-requests?status=pending%2Cin_progress');
    });

    it('applies pagination limit', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ pulloutRequests: mockPullouts });
      await getPulloutRequests({}, { limit: 10 });

      expect(apiFetch).toHaveBeenCalledWith('/pullout-requests?limit=10');
    });
  });

  describe('createPulloutRequest', () => {
    it('calls apiFetch POST and returns doc id', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'po-new' });

      const newRequestData = {
        sourceStoreId: 'warehouse-1',
        destinationStoreId: 'store-1',
        status: 'pending' as const,
        items: [],
      };

      const result = await createPulloutRequest(newRequestData, {
        summary: 'Test pullout',
        performedBy: 'user@example.com',
        performedByRole: 'warehouse',
        source: 'warehouse',
      });

      expect(apiFetch).toHaveBeenCalledWith('/pullout-requests', expect.objectContaining({ method: 'POST' }));
      expect(result).toBe('po-new');
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PULLOUT_COMPLETED',
          entityId: 'po-new',
        })
      );
    });
  });

  describe('updatePulloutRequest', () => {
    it('calls apiFetch PATCH on the correct document', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'po-1', status: 'completed' });

      await updatePulloutRequest(
        'po-1',
        { status: 'completed' },
        {
          summary: 'Completed pullout po-1',
          performedBy: 'admin@example.com',
          performedByRole: 'admin',
          source: 'admin',
        }
      );

      expect(apiFetch).toHaveBeenCalledWith('/pullout-requests/po-1', expect.objectContaining({ method: 'PATCH' }));
      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PULLOUT_COMPLETED',
          entityId: 'po-1',
        })
      );
    });
  });
});
