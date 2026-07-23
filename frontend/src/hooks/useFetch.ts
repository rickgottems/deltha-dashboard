import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    // Variável local (não ref compartilhada): cada execução do efeito tem a
    // sua própria, então uma resposta de uma `url` antiga que resolve depois
    // de uma mais nova é ignorada, mesmo com o componente ainda montado.
    let current = true;
    setLoading(true);
    setError(null);

    // Debounce: filtros como o MonthPicker mudam `url` a cada clique. Sem
    // isso, uma sequência rápida de cliques dispara uma requisição por
    // clique, sobrecarregando o pool de conexões do banco (já vimos P2024
    // por esse motivo). Só a última `url` depois de ~250ms de silêncio
    // dispara a busca de verdade.
    const timer = setTimeout(() => {
      api
        .get<T>(url)
        .then((d) => {
          if (current) setData(d);
        })
        .catch((e: Error) => {
          if (current) setError(e.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 250);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
