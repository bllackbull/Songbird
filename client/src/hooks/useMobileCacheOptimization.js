import { useEffect, useRef } from "react";

/**
 * Hook to optimize caching behavior on mobile devices.
 * Ensures:
 * 1. IndexedDB errors are handled gracefully
 * 2. Low-memory devices fall back to pagination-only mode
 * 3. Cache hits don't cause excessive rendering
 */
export function useMobileCacheOptimization() {
  const isLowMemoryDeviceRef = useRef(null);
  const cacheErrorCountRef = useRef(0);
  const MAX_CACHE_ERRORS_BEFORE_DISABLED = 3;

  // Detect low-memory device
  useEffect(() => {
    if (typeof navigator === "undefined" || isLowMemoryDeviceRef.current !== null) {
      return;
    }

    // Check device memory if available
    if ("deviceMemory" in navigator) {
      const deviceMemory = Number(navigator.deviceMemory || 4);
      isLowMemoryDeviceRef.current = deviceMemory < 4; // 4GB is the threshold
    } else {
      // Assume normal memory if not detectable
      isLowMemoryDeviceRef.current = false;
    }
  }, []);

  /**
   * Checks if cache operations should be disabled for this device
   */
  const isCacheDisabledForDevice = () => {
    return (
      isLowMemoryDeviceRef.current === true ||
      cacheErrorCountRef.current >= MAX_CACHE_ERRORS_BEFORE_DISABLED
    );
  };

  /**
   * Records a cache operation error
   */
  const recordCacheError = () => {
    cacheErrorCountRef.current += 1;
  };

  /**
   * Resets error counter when user clears cache
   */
  const resetCacheErrorCounter = () => {
    cacheErrorCountRef.current = 0;
  };

  // Log if cache is disabled for debugging
  useEffect(() => {
    if (isCacheDisabledForDevice()) {
      console.warn(
        "[Songbird Cache] Cache disabled: device memory resource constraint or repeated errors",
      );
    }
  }, []);

  /* eslint-disable react-hooks/refs */
  return {
    isCacheDisabledForDevice,
    recordCacheError,
    resetCacheErrorCounter,
    isLowMemoryDevice: isLowMemoryDeviceRef.current,
    cacheErrorCount: cacheErrorCountRef.current,
  };
  /* eslint-enable react-hooks/refs */
}
