import { withCache, invalidatePrefix } from '../cache';

describe('cache module', () => {
  beforeEach(() => {
    // Clear all cache by invalidating prefix ""
    invalidatePrefix("");
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withCache', () => {
    it('executes the fetcher on cache miss', async () => {
      const mockFetcher = jest.fn().mockResolvedValue('fresh-data');
      
      const result = await withCache('key1', 1000, mockFetcher);
      
      expect(result).toBe('fresh-data');
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('returns cached data on cache hit', async () => {
      const mockFetcher = jest.fn().mockResolvedValue('fresh-data');
      
      // First call (miss)
      await withCache('key1', 1000, mockFetcher);
      
      // Second call (hit)
      const result2 = await withCache('key1', 1000, mockFetcher);
      
      expect(result2).toBe('fresh-data');
      expect(mockFetcher).toHaveBeenCalledTimes(1); // Still 1
    });

    it('executes the fetcher again if cache has expired', async () => {
      const mockFetcher = jest.fn()
        .mockResolvedValueOnce('data-1')
        .mockResolvedValueOnce('data-2');
      
      await withCache('key1', 1000, mockFetcher);
      
      // Advance time past TTL
      jest.advanceTimersByTime(1001);
      
      const result2 = await withCache('key1', 1000, mockFetcher);
      
      expect(result2).toBe('data-2');
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidatePrefix', () => {
    it('removes only keys matching the prefix', async () => {
      const mockFetcher = jest.fn().mockResolvedValue('data');
      
      await withCache('prefix1_a', 1000, mockFetcher);
      await withCache('prefix1_b', 1000, mockFetcher);
      await withCache('prefix2_c', 1000, mockFetcher);
      
      expect(mockFetcher).toHaveBeenCalledTimes(3);

      // Invalidate prefix1
      invalidatePrefix('prefix1_');
      
      // Request again
      await withCache('prefix1_a', 1000, mockFetcher);
      await withCache('prefix1_b', 1000, mockFetcher);
      await withCache('prefix2_c', 1000, mockFetcher);
      
      // prefix1_a and prefix1_b should be fetched again, prefix2_c should hit cache
      expect(mockFetcher).toHaveBeenCalledTimes(5);
    });
  });
});
