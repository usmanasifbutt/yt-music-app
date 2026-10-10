import { File, Paths } from 'expo-file-system';
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
};

const indexFile = new File(Paths.document, 'library.json');

export const libraryStore = createStore<Track[]>([]);

// Entries saved by the first version of the app (audio only, private storage).
function upgrade(t: any): Track {
  if (t.key) return t;
  return {
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
  };
}

export async function loadLibrary() {
  if (!indexFile.exists) return;
  try {
    const tracks: Track[] = JSON.parse(await indexFile.text()).map(upgrade);
    // Drop entries whose file was deleted outside the app (e.g. from a file manager).
    const present = await Promise.all(tracks.map((t) => YtDlp.exists(t.uri)));
    libraryStore.set(tracks.filter((_, i) => present[i]));
    if (present.includes(false)) persist();
  } catch {
    libraryStore.set([]);
  }
}

function persist() {
  indexFile.write(JSON.stringify(libraryStore.get()));
}

export function addTrack(track: Track) {
  libraryStore.set((prev) => [track, ...prev.filter((t) => t.key !== track.key)]);
  persist();
}

/** Deletes the file and forgets the track. Returns false if Android refused to delete the file. */
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
  libraryStore.set((prev) => prev.filter((t) => t.key !== key));
  persist();
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
