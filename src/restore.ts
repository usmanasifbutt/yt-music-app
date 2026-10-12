import { Directory, File, Paths } from 'expo-file-system';
import { PermissionsAndroid, Platform } from 'react-native';
import YtDlp, { downloadKey, ScannedMedia, ScannedPlaylist, thumbnailFor } from '../modules/yt-dlp';
import { addTracks, getSetting, libraryStore, setSetting, Track } from './library';
import {
  createPlaylist,
  INDEX_MARKER,
  M3uMeta,
  META_PREFIX,
  playlistsStore,
  syncAllM3u,
} from './playlists';

export type RestoreResult = {
  /** Songs/videos added to the library. */
  tracks: number;
  /** Playlists recreated from .m3u files. */
  playlists: number;
  /** Whether Android let the app take over the old files (so it can update/delete them). */
  writeAccess: boolean;
  /** Duplicate playlist files deleted (copies like "Gym (1).m3u" or extra "All downloads"). */
  cleaned: number;
};

/** Read access to downloads left by an earlier install (they belong to that install). */
export async function requestReadPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted = Number(Platform.Version) >= 33 ? [P.READ_MEDIA_AUDIO, P.READ_MEDIA_VIDEO] : [P.READ_EXTERNAL_STORAGE];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  // Audio is what matters; videos are a bonus.
  return result[wanted[0]] === PermissionsAndroid.RESULTS.GRANTED;
}

type Entry = { path: string; meta: M3uMeta | null };

/** Resolves an .m3u line like "../../Movies/YT Music/x.mp4" against the playlist's folder. */
function resolvePath(dir: string, line: string) {
  const parts = dir.split('/');
  for (const segment of line.replace(/\\/g, '/').split('/')) {
    if (segment === '..') parts.pop();
    else if (segment && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

function parseM3u(playlist: ScannedPlaylist): Entry[] {
  const entries: Entry[] = [];
  let meta: M3uMeta | null = null;
  for (const raw of playlist.content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(META_PREFIX)) {
      try {
        meta = JSON.parse(line.slice(META_PREFIX.length));
      } catch {
        meta = null;
      }
    } else if (!line.startsWith('#')) {
      entries.push({ path: resolvePath(playlist.dir, line), meta });
      meta = null;
    }
  }
  return entries;
}

const unknown = (s: string | null) => (!s || s === '<unknown>' ? null : s);

// "Song - Artist.m4a" is how downloads are named; used when the file has no tags.
function fromFileName(path: string) {
  const base = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  const at = base.lastIndexOf(' - ');
  return at > 0 ? { title: base.slice(0, at), artist: base.slice(at + 3) } : { title: base, artist: null };
}

async function fetchThumbnail(id: string): Promise<string | null> {
  try {
    const dir = new Directory(Paths.document, 'thumbs');
    if (!dir.exists) dir.create({ intermediates: true });
    const file = new File(dir, `${id}.jpg`);
    if (!file.exists) await File.downloadFileAsync(thumbnailFor(id), file);
    return file.uri;
  } catch {
    return null; // offline; the list shows a placeholder instead
  }
}

/** The "All downloads" index carries a marker line (its name may have a copy suffix). */
const isIndex = (p: ScannedPlaylist) =>
  p.content
    .split(/\r?\n/, 3)
    .some((line) => line.trim() === INDEX_MARKER);

// Android names a clashing file "Gym (1).m3u"; treat such copies as the same playlist.
const COPY_SUFFIX = / \(\d+\)$/;
const baseName = (p: ScannedPlaylist) => p.name.replace(/\.m3u$/i, '');
const playlistName = (p: ScannedPlaylist) => baseName(p).replace(COPY_SUFFIX, '');

/**
 * Rebuilds the library and playlists from Music/YT Music and Movies/YT Music: adds media
 * files the library doesn't know and recreates playlists from their .m3u files. Safe to run
 * again; existing tracks and playlists are left alone.
 */
export async function restoreFromDevice(): Promise<RestoreResult> {
  const { media, playlists } = await YtDlp.scanFolders();
  const parsed = playlists.map((p) => ({ file: p, entries: parseM3u(p) }));

  // Video IDs from any .m3u (the library index lists every download).
  const metaByPath = new Map<string, M3uMeta>();
  for (const { entries } of parsed) for (const e of entries) if (e.meta) metaByPath.set(e.path, e.meta);

  const library = libraryStore.get();
  const knownUris = new Set(library.map((t) => t.uri));
  const knownKeys = new Set(library.map((t) => t.key));
  const keyByPath = new Map<string, string>();
  const newTracks: Track[] = [];
  const takeover: string[] = []; // files from the old install that we'll ask to own

  for (const m of media) {
    const existing = library.find((t) => t.uri === m.uri);
    if (existing) {
      keyByPath.set(m.path, existing.key);
      continue;
    }
    const meta = metaByPath.get(m.path);
    const key = meta ? downloadKey(meta.id, meta.kind, meta.h) : `file:${m.path}`;
    keyByPath.set(m.path, key);
    if (knownUris.has(m.uri) || knownKeys.has(key)) continue;
    knownKeys.add(key);
    const named = fromFileName(m.path);
    newTracks.push({
      key,
      videoId: meta?.id ?? '',
      kind: meta?.kind ?? m.kind,
      height: meta?.h ?? 0,
      title: unknown(m.title) ?? named.title,
      artist: unknown(m.artist) ?? named.artist ?? 'Unknown artist',
      duration: m.durationMs != null ? m.durationMs / 1000 : null,
      uri: m.uri,
      thumbnailPath: meta ? await fetchThumbnail(meta.id) : null,
      addedAt: meta?.added ?? m.addedAt,
      size: m.size,
      playCount: 0,
      lastPlayedAt: null,
    });
    takeover.push(m.uri);
  }

  // The index: keep the one in use (or the first found); extra copies get deleted.
  const indexes = parsed.filter(({ file }) => isIndex(file));
  const currentIndex = getSetting<string | null>('libraryIndexUri', null);
  const keepIndex = indexes.find(({ file }) => file.uri === currentIndex) ?? indexes[0];
  const extraFiles: string[] = indexes.filter((p) => p !== keepIndex).map(({ file }) => file.uri);

  // Playlists, grouped by name so "Gym.m3u" and "Gym (1).m3u" become one playlist.
  const groups = new Map<string, Parsed[]>();
  for (const p of parsed) {
    if (isIndex(p.file)) continue;
    const key = playlistName(p.file).toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const toCreate: Parsed[] = [];
  for (const [key, group] of groups) {
    const existing = playlistsStore.get().find((pl) => pl.name.toLowerCase() === key);
    if (existing) {
      // Already in the app: any other file with its name is a stale copy.
      extraFiles.push(...group.filter(({ file }) => file.uri !== existing.m3uUri).map(({ file }) => file.uri));
      continue;
    }
    // Prefer the file without a copy suffix, then the one with the most songs.
    const [best, ...copies] = [...group].sort(
      (a, b) =>
        Number(COPY_SUFFIX.test(baseName(a.file))) - Number(COPY_SUFFIX.test(baseName(b.file))) ||
        b.entries.length - a.entries.length
    );
    toCreate.push(best);
    extraFiles.push(...copies.map(({ file }) => file.uri));
  }

  // Never delete a file a playlist in the app is using (e.g. two playlists that share a name).
  const inUse = new Set(playlistsStore.get().map((p) => p.m3uUri));
  const stale = extraFiles.filter((uri) => !inUse.has(uri));

  takeover.push(...toCreate.map(({ file }) => file.uri), ...stale);
  if (keepIndex) takeover.push(keepIndex.file.uri);

  // One system dialog lets the app update/delete the old files again (Android 11+).
  const writeAccess = takeover.length ? await YtDlp.requestWriteAccess(takeover) : true;
  let cleaned = 0;

  addTracks(newTracks);
  for (const { file, entries } of toCreate) {
    const keys = entries.map((e) => keyByPath.get(e.path)).filter((k): k is string => !!k);
    // Without write access, keep the old file untouched; the app writes a new copy on the next change.
    createPlaylist(playlistName(file), keys, {
      m3uUri: writeAccess ? file.uri : undefined,
      write: writeAccess,
    });
  }
  if (writeAccess) {
    if (keepIndex) setSetting('libraryIndexUri', keepIndex.file.uri);
    const deleted = await Promise.all(stale.map((uri) => YtDlp.deleteMedia(uri).catch(() => false)));
    cleaned = deleted.filter(Boolean).length;
    syncAllM3u();
  }

  return { tracks: newTracks.length, playlists: toCreate.length, writeAccess, cleaned };
}

type Parsed = { file: ScannedPlaylist; entries: Entry[] };
