import YtDlp from '../modules/yt-dlp';
import { db, libraryStore, removeTrack, Track } from './library';
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

function setKeys(id: number, keys: string[]) {
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
  void writeM3u(id);
}

export function createPlaylist(name: string, keys: string[] = []): number {
  const createdAt = Date.now();
  const { lastInsertRowId } = db.runSync('INSERT INTO playlists (name, created_at) VALUES (?, ?)', [
    name.trim(),
    createdAt,
  ]);
  const id = Number(lastInsertRowId);
  playlistsStore.set((prev) => [{ id, name: name.trim(), createdAt, m3uUri: null, keys: [] }, ...prev]);
  setKeys(id, [...new Set(keys)]);
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
  if (playlist?.m3uUri) await YtDlp.deleteMedia(playlist.m3uUri).catch(() => false);
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
  return deleted;
}

/** Call after a download finishes so playlists waiting for it update their .m3u file. */
export function trackAdded(key: string) {
  for (const p of playlistsStore.get()) if (p.keys.includes(key)) void writeM3u(p.id);
}

/** Call after loadLibrary() with keys of tracks whose files disappeared. */
export function tracksMissing(keys: string[]) {
  for (const key of keys) {
    for (const p of playlistsStore.get()) {
      if (p.keys.includes(key)) setKeys(p.id, p.keys.filter((k) => k !== key));
    }
  }
}

const PLAYLIST_DIR = 'Music/YT Music';

// Path of a media file as seen from the .m3u, which lives in Music/YT Music/.
function relativeToPlaylist(mediaPath: string) {
  return mediaPath.startsWith(`${PLAYLIST_DIR}/`)
    ? mediaPath.slice(PLAYLIST_DIR.length + 1)
    : `../../${mediaPath}`;
}

const pendingWrites = new Map<number, Promise<void>>();

/**
 * Mirrors the playlist to Music/YT Music/<name>.m3u so other players (Files,
 * VLC, Poweramp…) see the same playlist. Writes for one playlist are serialized.
 */
function writeM3u(id: number): Promise<void> {
  const previous = pendingWrites.get(id) ?? Promise.resolve();
  const next = previous.then(async () => {
    const playlist = find(id);
    if (!playlist) return;
    const tracks = playlistTracks(playlist, libraryStore.get());
    const paths = await YtDlp.mediaPaths(tracks.map((t) => t.uri));
    const lines = ['#EXTM3U'];
    tracks.forEach((t, i) => {
      const path = paths[i];
      if (!path) return; // private (pre-Phase-1) downloads aren't reachable by other apps
      lines.push(`#EXTINF:${Math.round(t.duration ?? -1)},${t.artist} - ${t.title}`, relativeToPlaylist(path));
    });
    const uri = await YtDlp.writePlaylistFile(playlist.m3uUri, playlist.name, lines.join('\n') + '\n');
    if (uri !== playlist.m3uUri) {
      db.runSync('UPDATE playlists SET m3u_uri = ? WHERE id = ?', [uri, id]);
      playlistsStore.set((prev) => prev.map((p) => (p.id === id ? { ...p, m3uUri: uri } : p)));
    }
  });
  // Failure to mirror the file shouldn't break the in-app playlist.
  const settled = next.catch(() => {});
  pendingWrites.set(id, settled);
  return settled;
}
