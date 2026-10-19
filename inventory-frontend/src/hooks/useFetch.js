import { useCallback, useEffect, useRef, useState } from "react";

/** Run an async loader on mount / when deps change. Returns { data, loading, error, reload }. */
export default function useFetch(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    loaderRef
      .current()
      .then((data) => active && setState({ data, loading: false, error: "" }))
      .catch((err) => active && setState({ data: null, loading: false, error: err.message }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
