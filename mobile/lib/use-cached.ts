import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { cacheGet, cacheSet } from "./storage";

/**
 * Load data from the API and keep the last successful result in the on-device
 * cache. When the network fails, the cached copy is shown with an "offline"
 * flag so the screen still works without a connection.
 */
export function useCached<T>(key: string, fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      setError(null);
      const fresh = await fetcher();
      if (!alive.current) return;
      setData(fresh);
      setOffline(false);
      setCachedAt(null);
      void cacheSet(key, fresh);
    } catch (e) {
      const networkDown = e instanceof ApiError && e.status === 0;
      const cached = await cacheGet<T>(key);
      if (!alive.current) return;
      if (cached && (networkDown || !data)) {
        setData(cached.value);
        setOffline(true);
        setCachedAt(cached.at);
        if (!networkDown) setError(e instanceof Error ? e.message : "Could not refresh");
      } else {
        setError(e instanceof Error ? e.message : "Could not load");
      }
    } finally {
      if (alive.current) setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return { data, setData, error, offline, cachedAt, refreshing, refresh, reload: load };
}
