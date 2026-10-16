import { useCallback, useRef } from "react";

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  threshold?: number;
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 0.8,
}: UseInfiniteScrollOptions) {
  // Keep a ref to the latest values so the stable intersection callback
  // always sees current state without being recreated on every change.
  const stateRef = useRef({ hasMore, isLoading, onLoadMore });
  stateRef.current = { hasMore, isLoading, onLoadMore };

  // A ref callback is used instead of useRef + useEffect so that the observer
  // attaches exactly when the sentinel element mounts and detaches when it
  // unmounts. useEffect only runs on mount — if the sentinel is behind a
  // conditional (e.g. "hasMore && profiles.length > 0") the element doesn't
  // exist yet and the effect never re-runs when it eventually appears.
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (
            entry.isIntersecting &&
            stateRef.current.hasMore &&
            !stateRef.current.isLoading
          ) {
            stateRef.current.onLoadMore();
          }
        },
        { root: null, rootMargin: "0px", threshold }
      );

      observer.observe(node);

      // Return a cleanup that React will call when the element unmounts.
      return () => observer.disconnect();
    },
    [threshold] // only rebuilds if the intersection threshold itself changes
  );

  return sentinelRef;
}
