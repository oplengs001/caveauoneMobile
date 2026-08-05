import { getStoreWineSettings, upsertStoreWineSetting } from '../stockSettings';
import { apiFetch } from '@/lib/api';

const mockSettings = [
  { id: 'store1_wine1', storeId: 'store-1', masterWineId: 'wine-1', parLevel: 12, safetyStock: 3, discontinued: false },
  { id: 'store1_wine2', storeId: 'store-1', masterWineId: 'wine-2', parLevel: 6, safetyStock: 2, discontinued: false },
  { id: 'store2_wine1', storeId: 'store-2', masterWineId: 'wine-1', parLevel: 24, safetyStock: 6, discontinued: true },
];

describe('stockSettings queries', () => {
  describe('getStoreWineSettings', () => {
    it('returns all settings when no filters provided', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ settings: mockSettings });

      const result = await getStoreWineSettings();

      expect(result).toHaveLength(3);
    });

    it('applies storeId filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ settings: mockSettings.slice(0, 2) });

      await getStoreWineSettings({ storeId: 'store-1' });

      expect(apiFetch).toHaveBeenCalledWith('/stock-settings?storeId=store-1');
    });

    it('applies masterWineId filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ settings: [mockSettings[0], mockSettings[2]] });

      await getStoreWineSettings({ masterWineId: 'wine-1' });

      expect(apiFetch).toHaveBeenCalledWith('/stock-settings?masterWineId=wine-1');
    });

    it('applies discontinued filter', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ settings: [mockSettings[2]] });

      await getStoreWineSettings({ discontinued: true });

      expect(apiFetch).toHaveBeenCalledWith('/stock-settings?discontinued=true');
    });
  });

  describe('upsertStoreWineSetting', () => {
    it('calls apiFetch POST with storeId and masterWineId', async () => {
      (apiFetch as jest.Mock).mockResolvedValueOnce({ id: 'store-1_wine-1', parLevel: 10 });

      await upsertStoreWineSetting('store-1', 'wine-1', { parLevel: 10 });

      expect(apiFetch).toHaveBeenCalledWith('/stock-settings', expect.objectContaining({ method: 'POST' }));
    });
  });
});
