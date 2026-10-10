import YtDlp, { downloadKey, MediaKind, SearchResult } from '../modules/yt-dlp';
import { addTrack } from './library';
import { trackAdded } from './playlists';
import { createStore } from './store';

export type DownloadState = {
  key: string;
  item: SearchResult;
  kind: MediaKind;
  height: number;
  status: 'queued' | 'downloading' | 'error';
  progress: number;
  error?: string;
};

const MAX_PARALLEL = 2;

export const downloadsStore = createStore<Record<string, DownloadState>>({});

function patch(key: string, update: Partial<DownloadState>) {
  downloadsStore.set((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...update } } : prev));
}

function remove(key: string) {
  downloadsStore.set((prev) => {
    const { [key]: _, ...rest } = prev;
    return rest;
  });
}

YtDlp.addListener('onProgress', ({ id, progress }) => {
  if (progress >= 0) patch(id, { progress });
});

/** Strips Expo's "Call to function ... has been rejected. → Caused by:" wrapper. */
export function nativeErrorMessage(e: any): string {
  const raw: string = e?.message ?? String(e);
  const cause = raw.split(/Caused by:\s*/).pop() ?? raw;
  return cause.replace(/^ERROR:\s*/gm, '').trim();
}

function pump() {
  const all = Object.values(downloadsStore.get());
  let active = all.filter((d) => d.status === 'downloading').length;
  for (const d of all) {
    if (active >= MAX_PARALLEL) break;
    if (d.status !== 'queued') continue;
    active++;
    run(d);
  }
}

async function run({ key, item, kind, height }: DownloadState) {
  patch(key, { status: 'downloading', progress: 0 });
  try {
    const baseName = `${item.title} - ${item.artist}`;
    const { uri, thumbnailPath, size } = await YtDlp.download(key, item.id, kind, height, baseName);
    addTrack({
      key,
      videoId: item.id,
      kind,
      height,
      title: item.title,
      artist: item.artist,
      duration: item.duration,
      uri,
      thumbnailPath,
      addedAt: Date.now(),
      size,
      playCount: 0,
      lastPlayedAt: null,
    });
    trackAdded(key);
    remove(key);
  } catch (e: any) {
    const message = nativeErrorMessage(e);
    if (message === 'Canceled') remove(key);
    else patch(key, { status: 'error', error: message });
  }
  pump();
}

export function enqueueDownload(item: SearchResult, kind: MediaKind, height = 0) {
  const key = downloadKey(item.id, kind, height);
  const existing = downloadsStore.get()[key];
  if (existing && existing.status !== 'error') return;
  downloadsStore.set((prev) => ({
    ...prev,
    [key]: { key, item, kind, height, status: 'queued', progress: 0 },
  }));
  pump();
}

export function retryDownload(key: string) {
  const d = downloadsStore.get()[key];
  if (d) enqueueDownload(d.item, d.kind, d.height);
}

export function cancelDownload(key: string) {
  const d = downloadsStore.get()[key];
  if (d?.status === 'downloading') YtDlp.cancel(key);
  else remove(key);
}
