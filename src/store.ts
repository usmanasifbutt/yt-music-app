import { useSyncExternalStore } from 'react';

// Minimal observable store; enough for a single-screen app without extra deps.
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === 'function' ? (next as (prev: T) => T)(state) : next;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Store<T> = ReturnType<typeof createStore<T>>;

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}

/**
 * Re-renders only when `select` returns a different value. Use it for stores that change
 * often (the player updates every 500 ms) when a screen only needs one field, like the
 * key of the playing track. `select` must return a primitive or a stable reference.
 */
export function useStoreValue<T, V>(store: Store<T>, select: (state: T) => V): V {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
