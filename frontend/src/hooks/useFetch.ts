import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Busca GET com estados de loading/erro e recarga manual. */
export function useFetch<T>(url: string): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    setLoading(true);
    setError(null);
    api
      .get<T>(url)
      .then((d) => {
        if (active.current) setData(d);
      })
      .catch((e: Error) => {
        if (active.current) setError(e.message);
      })
      .finally(() => {
        if (active.current) setLoading(false);
      });
    return () => {
      active.current = false;
    };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
