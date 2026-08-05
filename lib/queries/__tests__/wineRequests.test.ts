import { getWineRequests, updateWineRequest } from '../wineRequests';
import { apiFetch } from '@/lib/api';
import { logActivity } from '@/lib/utils/activityLogger';

jest.mock('../cache', () => ({
  withCache: jest.fn(async (_k: string, _t: number, f: () => Promise<unknown>) => f()),
  invalidatePrefix: jest.fn(),
}));

const mockWineRequests = [
  { id: 'req-1', storeId: 'store-a', status: 'pending', totalAmount: 500, items: [] },
  { id: 'req-2', storeId: 'store-b', status: 'converted', totalAmount: 200, items: [] },
];

describe('wineRequests queries', () => {
  describe('getWineRequests', () => {
    it('returns all requests when no filters provided', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wineRequests: mockWineRequests });

      const result = await getWineRequests({});

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('req-1');
      expect(result[1].id).toBe('req-2');
    });

    it('applies storeId filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wineRequests: [mockWineRequests[0]] });

      await getWineRequests({ storeId: 'store-a' });

      expect(apiFetch).toHaveBeenCalledWith('/wine-requests?storeId=store-a');
    });

    it('applies status filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wineRequests: [mockWineRequests[0]] });

      await getWineRequests({ status: 'pending' });

      expect(apiFetch).toHaveBeenCalledWith('/wine-requests?status=pending');
    });

    it('applies array status filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wineRequests: mockWineRequests });

      await getWineRequests({ status: ['pending', 'converted'] });

      expect(apiFetch).toHaveBeenCalledWith('/wine-requests?status=pending%2Cconverted');
    });

    it('applies pagination limit', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ wineRequests: mockWineRequests });
      await getWineRequests({}, { limit: 10 });

      expect(apiFetch).toHaveBeenCalledWith('/wine-requests?limit=10');
    });
  });

  describe('updateWineRequest', () => {
    it('calls apiFetch PATCH with correct parameters', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'req-1', status: 'converted' });

      await updateWineRequest('req-1', { status: 'converted' });

      expect(apiFetch).toHaveBeenCalledWith('/wine-requests/req-1', expect.objectContaining({ method: 'PATCH' }));
    });

    it('calls logActivity when logData is provided', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'req-1', status: 'converted' });

      await updateWineRequest(
        'req-1',
        { status: 'converted' },
        {
          summary: 'Converted request req-1 to pullout',
          performedBy: 'store@example.com',
          performedByRole: 'store',
          source: 'store',
        }
      );

      expect(logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WINE_REQUEST_RECEIVING',
          entityId: 'req-1',
        })
      );
    });
  });
});
