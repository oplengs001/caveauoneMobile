import AsyncStorage from "@react-native-async-storage/async-storage";
import { Customer } from "@/types";
import { apiFetch } from "./api";

export const CUSTOMER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const PRODUCERS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export const getCustomerCacheKey = (storeId?: string | null) =>
  `customers_cache_${storeId || "all"}`;

export const PRODUCERS_CACHE_KEY = "producers_cache";

interface CachePayload<T> {
  data: T;
  ts: number;
}

// In-memory cache for instant synchronous or sub-millisecond lookups
const inMemoryCustomerCache = new Map<string, CachePayload<Customer[]>>();
let inMemoryProducersCache: CachePayload<string[]> | null = null;

/**
 * Reads customers from in-memory cache first, falling back to AsyncStorage.
 * Returns { data, isStale } or null if no cache exists.
 */
export async function getCachedCustomers(
  storeId?: string | null,
  ttlMs = CUSTOMER_CACHE_TTL_MS
): Promise<{ data: Customer[]; isStale: boolean } | null> {
  const key = getCustomerCacheKey(storeId);

  // 1. Check in-memory
  const mem = inMemoryCustomerCache.get(key);
  if (mem) {
    const isStale = Date.now() - mem.ts > ttlMs;
    return { data: mem.data, isStale };
  }

  // 2. Check AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: CachePayload<Customer[]> = JSON.parse(raw);
    if (!Array.isArray(parsed.data)) return null;

    // Populate memory cache
    inMemoryCustomerCache.set(key, parsed);

    const isStale = Date.now() - parsed.ts > ttlMs;
    return { data: parsed.data, isStale };
  } catch (err) {
    console.warn("[customerCache] Error reading customer cache:", err);
    return null;
  }
}

/**
 * Saves customer list to both in-memory and AsyncStorage.
 */
export async function setCachedCustomers(
  customers: Customer[],
  storeId?: string | null
): Promise<void> {
  const key = getCustomerCacheKey(storeId);
  const payload: CachePayload<Customer[]> = {
    data: customers,
    ts: Date.now(),
  };

  inMemoryCustomerCache.set(key, payload);

  try {
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch (err) {
    console.warn("[customerCache] Error writing customer cache:", err);
  }
}

/**
 * Appends or prepends a newly created customer to the cache,
 * ensuring subsequent opens immediately reflect the new customer without a full fetch.
 */
export async function appendCustomerToCache(
  newCustomer: Customer,
  storeId?: string | null
): Promise<Customer[]> {
  const cached = await getCachedCustomers(storeId);
  const list = cached?.data ? [...cached.data] : [];

  // Remove existing with same id if already present, then prepend
  const updated = [newCustomer, ...list.filter((c) => c.id !== newCustomer.id)];
  await setCachedCustomers(updated, storeId);
  return updated;
}

/**
 * Background prefetch helper: warms the customer cache on first app visit
 * or screen mount if cache is stale or missing.
 */
export async function prefetchCustomers(
  storeId?: string | null,
  force = false
): Promise<Customer[]> {
  if (!force) {
    const cached = await getCachedCustomers(storeId);
    if (cached && !cached.isStale) {
      return cached.data;
    }
  }

  try {
    const url = storeId ? `/customers?storeId=${storeId}` : `/customers`;
    const data = await apiFetch(url);
    const list: Customer[] = Array.isArray(data) ? data : data.customers || [];
    await setCachedCustomers(list, storeId);
    return list;
  } catch (err) {
    console.warn("[customerCache] Failed to prefetch customers:", err);
    const stale = await getCachedCustomers(storeId, Infinity);
    return stale?.data || [];
  }
}

/**
 * Reads master producers from in-memory or AsyncStorage.
 */
export async function getCachedProducers(
  ttlMs = PRODUCERS_CACHE_TTL_MS
): Promise<{ data: string[]; isStale: boolean } | null> {
  if (inMemoryProducersCache) {
    const isStale = Date.now() - inMemoryProducersCache.ts > ttlMs;
    return { data: inMemoryProducersCache.data, isStale };
  }

  try {
    const raw = await AsyncStorage.getItem(PRODUCERS_CACHE_KEY);
    if (!raw) return null;
    const parsed: CachePayload<string[]> = JSON.parse(raw);
    if (!Array.isArray(parsed.data)) return null;

    inMemoryProducersCache = parsed;
    const isStale = Date.now() - parsed.ts > ttlMs;
    return { data: parsed.data, isStale };
  } catch (err) {
    console.warn("[customerCache] Error reading producers cache:", err);
    return null;
  }
}

/**
 * Saves master producers to cache.
 */
export async function setCachedProducers(producers: string[]): Promise<void> {
  const payload: CachePayload<string[]> = {
    data: producers,
    ts: Date.now(),
  };

  inMemoryProducersCache = payload;

  try {
    await AsyncStorage.setItem(PRODUCERS_CACHE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[customerCache] Error writing producers cache:", err);
  }
}

/**
 * Updates customer metrics (orders count, total spend) in cache after a sale is completed,
 * ensuring the directory view displays up-to-date metrics immediately.
 */
export async function recordCustomerSaleInCache(
  customerId: string,
  amount: number,
  storeId?: string | null
): Promise<void> {
  const cached = await getCachedCustomers(storeId);
  if (!cached?.data) return;

  const updated = cached.data.map((c) => {
    if (c.id === customerId) {
      return {
        ...c,
        totalOrders: (c.totalOrders || 0) + 1,
        totalSpend: (c.totalSpend || 0) + amount,
      };
    }
    return c;
  });

  await setCachedCustomers(updated, storeId);
}

