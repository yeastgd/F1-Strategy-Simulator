"use client";

import { useEffect, useState } from "react";

/** True below the given breakpoint. First paint is `false` (SSR), then syncs. */
export function useNarrow(query = "(max-width: 600px)"): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return narrow;
}

/** Recharts mutates the DOM; don't mount it until the client tree is stable. */
export function useChartReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return ready;
}
