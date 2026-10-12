import YtDlp from '../modules/yt-dlp';
import { AUDIO_DIR } from './appInfo';
import { db, getSetting, libraryStore, removeTrack, setSetting, Track } from './library';
import { createStore } from './store';

export type Playlist = {
  id: number;
  name: string;
  createdAt: number;
  m3uUri: string | null;
  /** Ordered track keys; some may still be downloading. */
  keys: string[];
};

export const playlistsStore = createStore<Playlist[]>([]);

type PlaylistRow = { id: number; name: string; created_at: number; m3u_uri: string | null };

export function loadPlaylists() {
  const rows = db.getAllSync<PlaylistRow>('SELECT * FROM playlists ORDER BY created_at DESC');
  const items = db.getAllSync<{ playlist_id: number; track_key: string }>(
    'SELECT playlist_id, track_key FROM playlist_tracks ORDER BY playlist_id, position'
  );
  playlistsStore.set(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      m3uUri: r.m3u_uri,
      keys: items.filter((i) => i.playlist_id === r.id).map((i) => i.track_key),
    }))
  );
}

/** Downloaded tracks of a playlist, in playlist order (pending downloads are skipped). */
export function playlistTracks(playlist: Playlist, library: Track[]): Track[] {
  const byKey = new Map(library.map((t) => [t.key, t]));
  return playlist.keys.map((k) => byKey.get(k)).filter((t): t is Track => !!t);
}

const find = (id: number) => playlistsStore.get().find((p) => p.id === id);

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The playlist already using `name` (ignoring case and spaces), other than `exceptId`. */
export function playlistNamed(name: string, exceptId?: number) {
  return playlistsStore.get().find((p) => p.id !== exceptId && sameName(p.name, name));
}

/** `name` if it's free, otherwise "name 2", "name 3"... */
export function freeName(name: string) {
  const base = name.trim();
  let candidate = base;
  for (let n = 2; playlistNamed(candidate); n++) candidate = `${base} ${n}`;
  return candidate;
}

function setKeys(id: number, keys: string[], write = true) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [id]);
    keys.forEach((key, position) =>
      db.runSync('INSERT INTO playlist_tracks (playlist_id, track_key, position) VALUES (?, ?, ?)', [
        id,
        key,
        position,
      ])
    );
  });
  playlistsStore.set((prev) => prev.map((p) => (p.id === id ? { ...p, keys } : p)));
  if (write) void writeM3u(id);
}

/**
 * `m3uUri` adopts an existing .m3u (restore) instead of creating a new file; with
 * `write: false` the file is left as it is until the playlist next changes.
 */
export function createPlaylist(
  name: string,
  keys: string[] = [],
  options: { m3uUri?: string; write?: boolean } = {}
): number {
  const createdAt = Date.now();
  const m3uUri = options.m3uUri ?? null;
  const { lastInsertRowId } = db.runSync('INSERT INTO playlists (name, created_at, m3u_uri) VALUES (?, ?, ?)', [
    name.trim(),
    createdAt,
    m3uUri,
  ]);
  const id = Number(lastInsertRowId);
  playlistsStore.set((prev) => [{ id, name: name.trim(), createdAt, m3uUri, keys: [] }, ...prev]);
  setKeys(id, [...new Set(keys)], options.write ?? true);
  return id;
}

export function renamePlaylist(id: number, name: string) {
  db.runSync('UPDATE playlists SET name = ? WHERE id = ?', [name.trim(), id]);
  playlistsStore.set((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)));
  void writeM3u(id);
}

export async function deletePlaylist(id: number) {
  const playlist = find(id);
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM playlist_tracks WHERE playlist_id = ?', [id]);
    db.runSync('DELETE FROM playlists WHERE id = ?', [id]);
  });
  playlistsStore.set((prev) => prev.filter((p) => p.id !== id));
  const uri = playlist?.m3uUri;
  if (!uri) return;
  // A file from an earlier install needs Android's permission first; left behind, Restore
  // would bring the playlist back.
  const deleted = await YtDlp.deleteMedia(uri).catch(() => false);
  if (!deleted && (await YtDlp.requestWriteAccess([uri]))) await YtDlp.deleteMedia(uri).catch(() => false);
}

/** Appends keys that aren't already in the playlist. Returns how many were added. */
export function addToPlaylist(id: number, keys: string[]) {
  const playlist = find(id);
  if (!playlist) return 0;
  const fresh = [...new Set(keys)].filter((k) => !playlist.keys.includes(k));
  if (fresh.length) setKeys(id, [...playlist.keys, ...fresh]);
  return fresh.length;
}

export function removeFromPlaylist(id: number, key: string) {
  const playlist = find(id);
  if (playlist) setKeys(id, playlist.keys.filter((k) => k !== key));
}

/** Moves the track `key` one step up (-1) or down (+1) among the playlist's downloaded tracks. */
export function moveInPlaylist(id: number, key: string, direction: -1 | 1) {
  const playlist = find(id);
  if (!playlist) return;
  const visible = playlistTracks(playlist, libraryStore.get()).map((t) => t.key);
  const neighbour = visible[visible.indexOf(key) + direction];
  if (!neighbour) return;
  const keys = [...playlist.keys];
  const a = keys.indexOf(key);
  const b = keys.indexOf(neighbour);
  [keys[a], keys[b]] = [keys[b], keys[a]];
  setKeys(id, keys);
}

/** Deletes a track from the device and from every playlist that contains it. */
export async function deleteTrackEverywhere(key: string) {
  const affected = playlistsStore.get().filter((p) => p.keys.includes(key));
  const deleted = await removeTrack(key);
  for (const p of affected) setKeys(p.id, p.keys.filter((k) => k !== key));
  writeLibraryIndex();
  return deleted;
}

/** Call after a download finishes so playlists waiting for it update their .m3u file. */
export function trackAdded(key: string) {
  for (const p of playlistsStore.get()) if (p.keys.includes(key)) void writeM3u(p.id);
  writeLibraryIndex();
}

/** Call after loadLibrary() with keys of tracks whose files disappeared. */
export function tracksMissing(keys: string[]) {
  for (const key of keys) {
    for (const p of playlistsStore.get()) {
      if (p.keys.includes(key)) setKeys(p.id, p.keys.filter((k) => k !== key));
    }
  }
  if (keys.length) writeLibraryIndex();
}

/** Re-renders playlists after tracks were added in bulk (restore). */
export function refreshAll() {
  loadPlaylists();
  syncAllM3u();
}

const PLAYLIST_DIR = AUDIO_DIR;

// Path of a media file as seen from the .m3u, which lives in Music/YT Music/.
function relativeToPlaylist(mediaPath: string) {
  return mediaPath.startsWith(`${PLAYLIST_DIR}/`)
    ? mediaPath.slice(PLAYLIST_DIR.length + 1)
    : `../../${mediaPath}`;
}

/** Name of the .m3u that lists every download; restore uses it to recover video IDs. */
export const LIBRARY_INDEX_NAME = 'All downloads';

/**
 * Second line of the "All downloads" file. Restore recognises the index by this marker, not
 * by file name, because Android renames clashing files ("All downloads (1).m3u").
 */
export const INDEX_MARKER = '#YTM-INDEX';

/**
 * Per-entry metadata line, written before each file path. Players ignore unknown "#" lines;
 * restore reads it to recover the YouTube ID (for ✓ badges, thumbnails, de-duplication).
 */
export type M3uMeta = { id: string; kind: Track['kind']; h: number; added: number };
export const META_PREFIX = '#YTM:';

async function m3uContent(tracks: Track[], isIndex = false) {
  const paths = await YtDlp.mediaPaths(tracks.map((t) => t.uri));
  const lines = isIndex ? ['#EXTM3U', INDEX_MARKER] : ['#EXTM3U'];
  tracks.forEach((t, i) => {
    const path = paths[i];
    if (!path) return; // file vanished since the library was loaded
    lines.push(`#EXTINF:${Math.round(t.duration ?? -1)},${t.artist} - ${t.title}`);
    if (t.videoId) {
      const meta: M3uMeta = { id: t.videoId, kind: t.kind, h: t.height, added: t.addedAt };
      lines.push(META_PREFIX + JSON.stringify(meta));
    }
    lines.push(relativeToPlaylist(path));
  });
  return lines.join('\n') + '\n';
}

const pendingWrites = new Map<number | 'index', Promise<void>>();

// Writes for the same file are serialized so an older write can't land after a newer one.
function serialized(slot: number | 'index', task: () => Promise<void>): Promise<void> {
  const previous = pendingWrites.get(slot) ?? Promise.resolve();
  // Failure to mirror a file shouldn't break the in-app library or playlist.
  const settled = previous.then(task).catch(() => {});
  pendingWrites.set(slot, settled);
  return settled;
}

/**
 * Mirrors the playlist to Music/YT Music/<name>.m3u so other players (Files,
 * VLC, Poweramp…) see the same playlist.
 */
function writeM3u(id: number): Promise<void> {
  return serialized(id, async () => {
    const playlist = find(id);
    if (!playlist) return;
    const content = await m3uContent(playlistTracks(playlist, libraryStore.get()));
    const uri = await YtDlp.writePlaylistFile(playlist.m3uUri, playlist.name, content);
    if (uri !== playlist.m3uUri) {
      db.runSync('UPDATE playlists SET m3u_uri = ? WHERE id = ?', [uri, id]);
      playlistsStore.set((prev) => prev.map((p) => (p.id === id ? { ...p, m3uUri: uri } : p)));
    }
  });
}

let indexTimer: ReturnType<typeof setTimeout> | null = null;

/** Rewrites "All downloads.m3u" (every download, newest first). Debounced for bursts of changes. */
export function writeLibraryIndex(delayMs = 2000) {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    indexTimer = null;
    void serialized('index', async () => {
      const existing = getSetting<string | null>('libraryIndexUri', null);
      // A fresh install starts empty: writing now would only create an empty copy next to the
      // previous install's index (which restore is about to adopt).
      if (!existing && !libraryStore.get().length) return;
      const content = await m3uContent(libraryStore.get(), true);
      const uri = await YtDlp.writePlaylistFile(existing, LIBRARY_INDEX_NAME, content);
      if (uri !== existing) setSetting('libraryIndexUri', uri);
    });
  }, delayMs);
}

/** Rewrites every .m3u, recreating any that were deleted outside the app. Run at startup. */
export function syncAllM3u() {
  for (const p of playlistsStore.get()) void writeM3u(p.id);
  writeLibraryIndex(0);
}
