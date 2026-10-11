import { mix, search, SearchResult } from '../modules/yt-dlp';
import { INTERESTS, interestsStore, todaysQuery } from './interests';
import { getSetting, libraryStore, setSetting, Track } from './library';
import { createStore } from './store';

export type OnlineRow = {
  key: string;
  title: string;
  items: SearchResult[];
  /** loading = fetching (items may still hold the previous cached results). */
  status: 'loading' | 'ready' | 'error';
};

/** Online Home rows, in display order. */
export const homeStore = createStore<OnlineRow[]>([]);

const TTL_MS = 24 * 60 * 60 * 1000;
const ROW_SIZE = 12;
export const MIX_TITLE = 'Inspired by your listening';
const PARALLEL = 2; // each fetch is a yt-dlp (Python) process

type Cached = { fetchedAt: number; items: SearchResult[] };
type RowDef = { key: string; title: string; load: () => Promise<SearchResult[]> };

/** Seed for the related-songs row: the last thing played, else the newest download. */
function mixSeed(library: Track[]): Track | undefined {
  const withId = library.filter((t) => t.videoId);
  const lastPlayed = withId
    .filter((t) => t.lastPlayedAt)
    .sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!)[0];
  return lastPlayed ?? [...withId].sort((a, b) => b.addedAt - a.addedAt)[0];
}

function rowDefs(): RowDef[] {
  const seed = mixSeed(libraryStore.get());
  const mixes: RowDef[] = seed
    ? [{ key: `mix:${seed.videoId}`, title: MIX_TITLE, load: () => mix(seed.videoId, ROW_SIZE) }]
    : [];
  const interests: RowDef[] = (interestsStore.get() ?? [])
    .map((id) => INTERESTS.find((i) => i.id === id))
    .filter((i) => !!i)
    .map((interest) => ({
      key: `interest:${interest.id}`,
      title: interest.label,
      load: async () => (await search(todaysQuery(interest), ROW_SIZE)).results,
    }));
  return [...mixes, ...interests];
}

function setRow(key: string, update: Partial<OnlineRow>) {
  homeStore.set((rows) => rows.map((r) => (r.key === key ? { ...r, ...update } : r)));
}

async function loadRow(def: RowDef, force: boolean) {
  const cacheKey = `home:${def.key}`;
  const cached = getSetting<Cached | null>(cacheKey, null);
  if (cached && !force && Date.now() - cached.fetchedAt < TTL_MS) return;
  setRow(def.key, { status: 'loading' });
  try {
    const items = await def.load();
    setSetting(cacheKey, { fetchedAt: Date.now(), items } satisfies Cached);
    setRow(def.key, { items, status: 'ready' });
  } catch {
    // Offline or YouTube hiccup: keep showing yesterday's results if we have them.
    setRow(def.key, { status: cached ? 'ready' : 'error' });
  }
}

let refreshing: Promise<void> | null = null;

/**
 * Rebuilds the row list (interests and mix seeds may have changed) and fetches stale rows.
 * Cached rows show immediately; `force` refetches everything (pull to refresh).
 */
export function refreshHome(force = false): Promise<void> {
  if (refreshing && !force) return refreshing;
  const defs = rowDefs();
  homeStore.set(
    defs.map((def) => {
      const cached = getSetting<Cached | null>(`home:${def.key}`, null);
      return { key: def.key, title: def.title, items: cached?.items ?? [], status: cached ? 'ready' : 'loading' };
    })
  );
  const queue = [...defs];
  const worker = async () => {
    for (let def = queue.shift(); def; def = queue.shift()) await loadRow(def, force);
  };
  refreshing = Promise.all(Array.from({ length: PARALLEL }, worker)).then(() => {
    refreshing = null;
  });
  return refreshing;
}
