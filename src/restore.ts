import { Directory, File, Paths } from 'expo-file-system';
import { PermissionsAndroid, Platform } from 'react-native';
import YtDlp, { downloadKey, ScannedMedia, ScannedPlaylist, thumbnailFor } from '../modules/yt-dlp';
import { addTracks, libraryStore, setSetting, Track } from './library';
import {
  createPlaylist,
  LIBRARY_INDEX_NAME,
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

const isIndex = (p: ScannedPlaylist) => p.name === `${LIBRARY_INDEX_NAME}.m3u`;

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

  // Playlists whose name or file the app doesn't already have.
  const existingNames = new Set(playlistsStore.get().map((p) => p.name.toLowerCase()));
  const existingFiles = new Set(playlistsStore.get().map((p) => p.m3uUri));
  const toCreate = parsed.filter(({ file }) => {
    const name = file.name.replace(/\.m3u$/i, '');
    return !isIndex(file) && !existingFiles.has(file.uri) && !existingNames.has(name.toLowerCase());
  });
  takeover.push(...toCreate.map(({ file }) => file.uri));
  const index = parsed.find(({ file }) => isIndex(file));
  if (index) takeover.push(index.file.uri);

  // One system dialog lets the app update/delete the old files again (Android 11+).
  const writeAccess = takeover.length ? await YtDlp.requestWriteAccess(takeover) : true;

  addTracks(newTracks);
  for (const { file, entries } of toCreate) {
    const keys = entries.map((e) => keyByPath.get(e.path)).filter((k): k is string => !!k);
    // Without write access, keep the old file untouched; the app writes a new copy on the next change.
    createPlaylist(file.name.replace(/\.m3u$/i, ''), keys, {
      m3uUri: writeAccess ? file.uri : undefined,
      write: writeAccess,
    });
  }
  if (index && writeAccess) setSetting('libraryIndexUri', index.file.uri);
  if (writeAccess) syncAllM3u();

  return { tracks: newTracks.length, playlists: toCreate.length, writeAccess };
}
