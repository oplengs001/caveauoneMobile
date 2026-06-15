// Setup for warehouse-app purely logic tests

// Mock standard React Native APIs
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    select: jest.fn((dict: any) => dict.ios),
  },
}), { virtual: true });

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}), { virtual: true });

// Mock expo-camera (scanner features)
jest.mock('expo-camera', () => ({
  CameraView: jest.fn(),
  Camera: { requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }) },
  useCameraPermissions: jest.fn().mockReturnValue([{ granted: true }, jest.fn()]),
}), { virtual: true });

// Mock expo-print
jest.mock('expo-print', () => ({
  printAsync: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

// ─── Firebase Mocks ──────────────────────────────────────────────────────────
// We mock both the app-level firebase module and the firebase/firestore SDK
// using inline factories so there is no circular require.

const makeDocs = (items: Array<{ id: string; [key: string]: any }>) => ({
  docs: items.map((item) => ({
    id: item.id,
    data: () => {
      const { id: _id, ...rest } = item;
      return rest;
    },
    exists: () => true,
  })),
  empty: items.length === 0,
  size: items.length,
});

const makeDocSnap = (id: string, data: Record<string, any> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

const firestoreMock = {
  db: { collection: jest.fn(), doc: jest.fn() },
  auth: {
    currentUser: null,
    signInWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(),
  },
  collection: jest.fn().mockReturnValue('mock-collection-ref'),
  doc: jest.fn().mockReturnValue('mock-doc-ref'),
  query: jest.fn().mockImplementation((...args: any[]) => args[0]),
  where: jest.fn().mockReturnValue('mock-where'),
  orderBy: jest.fn().mockReturnValue('mock-orderBy'),
  limit: jest.fn().mockReturnValue('mock-limit'),
  getDocs: jest.fn().mockResolvedValue(makeDocs([])),
  getDoc: jest.fn().mockResolvedValue(makeDocSnap('mock-id', null)),
  addDoc: jest.fn().mockResolvedValue({ id: 'mock-new-doc-id' }),
  updateDoc: jest.fn().mockResolvedValue(undefined),
  setDoc: jest.fn().mockResolvedValue(undefined),
  deleteDoc: jest.fn().mockResolvedValue(undefined),
  getCountFromServer: jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
  getAggregateFromServer: jest.fn().mockResolvedValue({
    data: () => ({ totalRevenue: 0, totalItems: 0 }),
  }),
  sum: jest.fn().mockReturnValue('mock-sum'),
  count: jest.fn().mockReturnValue('mock-count'),
  serverTimestamp: jest.fn().mockReturnValue('mock-server-timestamp'),
  Timestamp: {
    fromDate: jest.fn((date: Date) => ({ toDate: () => date, seconds: Math.floor(date.getTime() / 1000) })),
    now: jest.fn(() => ({ toDate: () => new Date() })),
  },
  makeDocs,
  makeDocSnap,
};

jest.mock('@/lib/firebase', () => firestoreMock);
jest.mock('firebase/firestore', () => firestoreMock);

// Mock activityLogger so tests don't trigger real Firestore writes
jest.mock('@/lib/utils/activityLogger', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

// Clear all mock call state before each test
beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply default return values after clearAllMocks wipes them
  firestoreMock.collection.mockReturnValue('mock-collection-ref');
  firestoreMock.doc.mockReturnValue('mock-doc-ref');
  firestoreMock.query.mockImplementation((...args: any[]) => args[0]);
  firestoreMock.where.mockReturnValue('mock-where');
  firestoreMock.orderBy.mockReturnValue('mock-orderBy');
  firestoreMock.limit.mockReturnValue('mock-limit');
  firestoreMock.getDocs.mockResolvedValue(makeDocs([]));
  firestoreMock.getDoc.mockResolvedValue(makeDocSnap('mock-id', null));
  firestoreMock.addDoc.mockResolvedValue({ id: 'mock-new-doc-id' });
  firestoreMock.updateDoc.mockResolvedValue(undefined);
  firestoreMock.setDoc.mockResolvedValue(undefined);
  firestoreMock.deleteDoc.mockResolvedValue(undefined);
  firestoreMock.getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });
  firestoreMock.getAggregateFromServer.mockResolvedValue({
    data: () => ({ totalRevenue: 0, totalItems: 0 }),
  });
});
