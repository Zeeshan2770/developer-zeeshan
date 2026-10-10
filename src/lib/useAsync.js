import { useEffect, useState } from 'react';

// Tiny data hook: { data, loading, error }. `fn` must return a promise of { data, error }.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve(fn())
      .then((res) => alive && setState({ data: res?.data ?? null, loading: false, error: res?.error ?? null }))
      .catch((error) => alive && setState({ data: null, loading: false, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
