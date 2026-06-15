/**
 * Global Firebase mock for warehouse-app tests.
 *
 * Provides proper QuerySnapshot shape so getDocs() results
 * can be mapped via .docs[].id and .docs[].data().
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fake QuerySnapshot from an array of plain objects */
export const makeDocs = (items: Array<{ id: string; [key: string]: any }>) => ({
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

/** Build a fake single DocumentSnapshot */
export const makeDocSnap = (id: string, data: Record<string, any> | null) => ({
  id,
  exists: () => data !== null,
  data: () => data,
});

// ─── db object (for libs that import db directly) ────────────────────────────

export const db = {
  collection: jest.fn(),
  doc: jest.fn(),
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  currentUser: null,
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
};

// ─── Top-level firestore functions ────────────────────────────────────────────
// Query files import these directly from "firebase/firestore" — the
// moduleNameMapper in jest.config.js routes that import here.

export const collection = jest.fn().mockReturnValue('mock-collection-ref');
export const doc = jest.fn().mockReturnValue('mock-doc-ref');
export const query = jest.fn().mockImplementation((...args) => args[0]);
export const where = jest.fn().mockReturnValue('mock-where');
export const orderBy = jest.fn().mockReturnValue('mock-orderBy');
export const limit = jest.fn().mockReturnValue('mock-limit');

export const getDocs = jest.fn().mockResolvedValue(makeDocs([]));
export const getDoc = jest.fn().mockResolvedValue(makeDocSnap('mock-id', null));
export const addDoc = jest.fn().mockResolvedValue({ id: 'mock-new-doc-id' });
export const updateDoc = jest.fn().mockResolvedValue(undefined);
export const setDoc = jest.fn().mockResolvedValue(undefined);
export const deleteDoc = jest.fn().mockResolvedValue(undefined);

export const getCountFromServer = jest.fn().mockResolvedValue({
  data: () => ({ count: 0 }),
});

export const getAggregateFromServer = jest.fn().mockResolvedValue({
  data: () => ({ totalRevenue: 0, totalItems: 0 }),
});

export const sum = jest.fn().mockReturnValue('mock-sum');
export const count = jest.fn().mockReturnValue('mock-count');

export const serverTimestamp = jest.fn().mockReturnValue('mock-server-timestamp');

export const Timestamp = {
  fromDate: jest.fn((date: Date) => ({ toDate: () => date, seconds: Math.floor(date.getTime() / 1000) })),
  now: jest.fn(() => ({ toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000) })),
};
