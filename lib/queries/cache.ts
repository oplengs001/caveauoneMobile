const _cache = new Map<string, { data: unknown; expiresAt: number }>();

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = _cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.data as T;
  }
  const data = await fetcher();
  _cache.set(key, { data, expiresAt: now + ttlMs });
  return data;
}

export function invalidatePrefix(prefix: string) {
  for (const key of _cache.keys()) {
    if (key.startsWith(prefix)) {
      _cache.delete(key);
    }
  }
}
