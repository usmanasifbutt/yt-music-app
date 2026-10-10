import { File, Paths } from 'expo-file-system';
import { openDatabaseSync } from 'expo-sqlite';
import YtDlp, { MediaKind } from '../modules/yt-dlp';
import { createStore } from './store';

export type Track = {
  /** Unique per downloaded variant, see downloadKey(). */
  key: string;
  videoId: string;
  kind: MediaKind;
  /** Video height for video downloads, 0 for audio. */
  height: number;
  title: string;
  artist: string;
  duration: number | null;
  /** content:// URI in Music/ or Movies/ (or file:// for old/private downloads). */
  uri: string;
  thumbnailPath: string | null;
  addedAt: number;
  /** File size in bytes, null until known. */
  size: number | null;
  playCount: number;
  lastPlayedAt: number | null;
};

export const db = openDatabaseSync('library.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS tracks (
    key TEXT PRIMARY KEY NOT NULL,
    video_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    height INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    duration REAL,
    uri TEXT NOT NULL,
    thumbnail_path TEXT,
    added_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    m3u_uri TEXT
  );
  -- track_key may point at a track that is still downloading (e.g. an imported
  -- YouTube playlist), so there is deliberately no foreign key to tracks.
  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL,
    track_key TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_key)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`);

// Columns added after the first release; ALTER TABLE has no IF NOT EXISTS.
const trackColumns = new Set(db.getAllSync<{ name: string }>('PRAGMA table_info(tracks)').map((c) => c.name));
for (const [name, type] of [
  ['size', 'INTEGER'],
  ['play_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_played_at', 'INTEGER'],
]) {
  if (!trackColumns.has(name)) db.execSync(`ALTER TABLE tracks ADD COLUMN ${name} ${type}`);
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  try {
    return row ? (JSON.parse(row.value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown) {
  db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
}

type TrackRow = {
  key: string;
  video_id: string;
  kind: MediaKind;
  height: number;
  title: string;
  artist: string;
  duration: number | null;
  uri: string;
  thumbnail_path: string | null;
  added_at: number;
  size: number | null;
  play_count: number;
  last_played_at: number | null;
};

const fromRow = (r: TrackRow): Track => ({
  size: r.size,
  playCount: r.play_count,
  lastPlayedAt: r.last_played_at,
  key: r.key,
  videoId: r.video_id,
  kind: r.kind,
  height: r.height,
  title: r.title,
  artist: r.artist,
  duration: r.duration,
  uri: r.uri,
  thumbnailPath: r.thumbnail_path,
  addedAt: r.added_at,
});

function insertTrack(t: Track) {
  db.runSync(
    `INSERT OR REPLACE INTO tracks
       (key, video_id, kind, height, title, artist, duration, uri, thumbnail_path, added_at,
        size, play_count, last_played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.key,
      t.videoId,
      t.kind,
      t.height,
      t.title,
      t.artist,
      t.duration,
      t.uri,
      t.thumbnailPath,
      t.addedAt,
      t.size ?? null,
      t.playCount ?? 0,
      t.lastPlayedAt ?? null,
    ]
  );
}

export const libraryStore = createStore<Track[]>([]);

// The first versions of the app kept the library in library.json.
const legacyIndex = new File(Paths.document, 'library.json');

function migrateLegacyIndex() {
  if (!legacyIndex.exists) return;
  try {
    const old: any[] = JSON.parse(legacyIndex.textSync());
    db.withTransactionSync(() => {
      for (const t of old) {
        insertTrack(
          t.key
            ? t
            : {
                key: `${t.id}:audio`,
                videoId: t.id,
                kind: 'audio',
                height: 0,
                title: t.title,
                artist: t.artist,
                duration: t.duration,
                uri: t.audioPath,
                thumbnailPath: t.thumbnailPath,
                addedAt: t.addedAt,
                size: null,
                playCount: 0,
                lastPlayedAt: null,
              }
        );
      }
    });
    legacyIndex.delete();
  } catch {
    // Leave the file in place; nothing is lost and we can retry next launch.
  }
}

export async function loadLibrary() {
  migrateLegacyIndex();
  const tracks = db.getAllSync<TrackRow>('SELECT * FROM tracks ORDER BY added_at DESC').map(fromRow);
  // Drop entries whose file was deleted outside the app (e.g. from a file manager).
  const present = await Promise.all(tracks.map((t) => YtDlp.exists(t.uri)));
  const missing = tracks.filter((_, i) => !present[i]);
  if (missing.length) {
    db.withTransactionSync(() => {
      for (const t of missing) db.runSync('DELETE FROM tracks WHERE key = ?', [t.key]);
    });
  }
  const kept = tracks.filter((_, i) => present[i]);

  // Sizes weren't recorded before v1.2; look them up once and store them.
  const unsized = kept.filter((t) => t.size == null);
  if (unsized.length) {
    const sizes = await YtDlp.mediaSizes(unsized.map((t) => t.uri));
    db.withTransactionSync(() => {
      unsized.forEach((t, i) => {
        t.size = sizes[i];
        if (sizes[i] != null) db.runSync('UPDATE tracks SET size = ? WHERE key = ?', [sizes[i], t.key]);
      });
    });
  }

  libraryStore.set(kept);
  return missing.map((t) => t.key);
}

export function addTrack(track: Track) {
  insertTrack(track);
  libraryStore.set((prev) => [track, ...prev.filter((t) => t.key !== track.key)]);
}

/** Records a play for "Most played", "Recently played" and storage clean-up. */
export function markPlayed(key: string) {
  const now = Date.now();
  db.runSync('UPDATE tracks SET play_count = play_count + 1, last_played_at = ? WHERE key = ?', [now, key]);
  libraryStore.set((prev) =>
    prev.map((t) => (t.key === key ? { ...t, playCount: t.playCount + 1, lastPlayedAt: now } : t))
  );
}

/**
 * Deletes the file and the track row. Returns false if Android refused to delete the
 * file. Playlist membership is cleaned up by deleteTrackEverywhere() in playlists.ts.
 */
export async function removeTrack(key: string) {
  const track = libraryStore.get().find((t) => t.key === key);
  if (!track) return true;
  const deleted = await YtDlp.deleteMedia(track.uri);
  // Thumbnails are shared between audio/video variants of the same video.
  const thumbStillUsed = libraryStore
    .get()
    .some((t) => t.key !== key && t.thumbnailPath === track.thumbnailPath);
  if (track.thumbnailPath && !thumbStillUsed) {
    const thumb = new File(track.thumbnailPath);
    if (thumb.exists) thumb.delete();
  }
  db.runSync('DELETE FROM tracks WHERE key = ?', [key]);
  libraryStore.set((prev) => prev.filter((t) => t.key !== key));
  return deleted;
}

const engineStampFile = new File(Paths.document, 'engine-updated-at');
const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldAutoUpdate() {
  if (!engineStampFile.exists) return true;
  const last = Number(engineStampFile.textSync());
  return !last || Date.now() - last > DAY_MS;
}

export function markUpdated() {
  engineStampFile.write(String(Date.now()));
}
