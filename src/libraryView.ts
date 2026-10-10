import { getSetting, setSetting, Track } from './library';
import { Playlist } from './playlists';
import { createStore } from './store';

export type SortKey = 'added' | 'title' | 'artist' | 'duration' | 'plays';
export type FilterKey = 'all' | 'notInPlaylist' | 'recent';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'added', label: 'Date added' },
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'duration', label: 'Length' },
  { key: 'plays', label: 'Most played' },
];

export const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'notInPlaylist', label: 'Not in a playlist' },
  { key: 'recent', label: 'Recently played' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 14;
/** Items not played (or added) for this long are offered for clean-up. */
export const STALE_DAYS = 30;

// The chosen sort is remembered across launches.
export const sortStore = createStore<SortKey>('added');
let sortLoaded = false;

export function loadSort() {
  if (sortLoaded) return;
  sortLoaded = true;
  const saved = getSetting<SortKey>('librarySort', 'added');
  if (SORT_OPTIONS.some((o) => o.key === saved)) sortStore.set(saved);
}

export function setSort(sort: SortKey) {
  sortStore.set(sort);
  setSetting('librarySort', sort);
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

const comparators: Record<SortKey, (a: Track, b: Track) => number> = {
  added: (a, b) => b.addedAt - a.addedAt,
  title: (a, b) => byText(a.title, b.title),
  artist: (a, b) => byText(a.artist, b.artist) || byText(a.title, b.title),
  duration: (a, b) => (b.duration ?? 0) - (a.duration ?? 0),
  plays: (a, b) => b.playCount - a.playCount || (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0),
};

/** Filters, searches and sorts tracks for display. "Recently played" is always newest-played first. */
export function applyView(
  tracks: Track[],
  { sort, filter, query }: { sort: SortKey; filter: FilterKey; query: string },
  playlists: Playlist[]
): Track[] {
  let list = tracks;
  if (filter === 'notInPlaylist') {
    const inPlaylist = new Set(playlists.flatMap((p) => p.keys));
    list = list.filter((t) => !inPlaylist.has(t.key));
  } else if (filter === 'recent') {
    const since = Date.now() - RECENT_DAYS * DAY_MS;
    list = list.filter((t) => (t.lastPlayedAt ?? 0) >= since);
  }
  const q = query.trim().toLowerCase();
  if (q) list = list.filter((t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  const compare = filter === 'recent' ? (a: Track, b: Track) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) : comparators[sort];
  return [...list].sort(compare);
}

export function staleTracks(tracks: Track[]) {
  const cutoff = Date.now() - STALE_DAYS * DAY_MS;
  return tracks.filter((t) => (t.lastPlayedAt ?? t.addedAt) < cutoff);
}

export const totalSize = (tracks: Track[]) => tracks.reduce((sum, t) => sum + (t.size ?? 0), 0);

export function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(0, Math.round(bytes / 1e3))} KB`;
}
