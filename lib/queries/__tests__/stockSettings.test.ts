import { getStoreWineSettings, upsertStoreWineSetting } from '../stockSettings';
import { getDocs, setDoc, doc, where } from 'firebase/firestore';

const makeDocs = (items: Array<{ id: string; [key: string]: any }>) => ({
  docs: items.map((item) => ({
    id: item.id,
    data: () => { const { id: _id, ...rest } = item; return rest; },
    exists: () => true,
  })),
  empty: items.length === 0,
});

const mockSettings = [
  { id: 'store1_wine1', storeId: 'store-1', masterWineId: 'wine-1', parLevel: 12, safetyStock: 3, discontinued: false },
  { id: 'store1_wine2', storeId: 'store-1', masterWineId: 'wine-2', parLevel: 6, safetyStock: 2, discontinued: false },
  { id: 'store2_wine1', storeId: 'store-2', masterWineId: 'wine-1', parLevel: 24, safetyStock: 6, discontinued: true },
];

describe('stockSettings queries', () => {
  describe('getStoreWineSettings', () => {
    it('returns all settings when no filters provided', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockSettings));

      const result = await getStoreWineSettings();

      expect(result).toHaveLength(3);
    });

    it('applies storeId filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs(mockSettings.slice(0, 2)));

      await getStoreWineSettings({ storeId: 'store-1' });

      expect(where).toHaveBeenCalledWith('storeId', '==', 'store-1');
    });

    it('applies masterWineId filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockSettings[0], mockSettings[2]]));

      await getStoreWineSettings({ masterWineId: 'wine-1' });

      expect(where).toHaveBeenCalledWith('masterWineId', '==', 'wine-1');
    });

    it('applies discontinued filter', async () => {
      (getDocs as jest.Mock).mockResolvedValueOnce(makeDocs([mockSettings[2]]));

      await getStoreWineSettings({ discontinued: true });

      expect(where).toHaveBeenCalledWith('discontinued', '==', true);
    });

    it('can combine multiple filters', async () => {
      await getStoreWineSettings({ storeId: 'store-1', discontinued: false });

      expect(where).toHaveBeenCalledWith('storeId', '==', 'store-1');
      expect(where).toHaveBeenCalledWith('discontinued', '==', false);
    });
  });

  describe('upsertStoreWineSetting', () => {
    it('calls setDoc with the composite docId and merge option', async () => {
      const settingData = { parLevel: 18, safetyStock: 4, discontinued: false };

      await upsertStoreWineSetting('store-1', 'wine-1', settingData);

      expect(doc).toHaveBeenCalledWith(expect.anything(), 'store_wine_settings', 'store-1_wine-1');
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        settingData,
        { merge: true }
      );
    });

    it('uses correct composite ID format storeId_wineId', async () => {
      await upsertStoreWineSetting('store-abc', 'wine-xyz', { parLevel: 6 });

      expect(doc).toHaveBeenCalledWith(expect.anything(), 'store_wine_settings', 'store-abc_wine-xyz');
    });
  });
});
