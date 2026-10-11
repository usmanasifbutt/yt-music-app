import { PermissionsAndroid, Platform } from 'react-native';
import YtDlp, { downloadKey, MediaKind, SearchResult } from '../modules/yt-dlp';
import { addTrack, libraryStore } from './library';
import { trackAdded } from './playlists';
import { settingsStore } from './settings';
import { createStore } from './store';

export type DownloadState = {
  key: string;
  item: SearchResult;
  kind: MediaKind;
  height: number;
  status: 'queued' | 'downloading' | 'error';
  progress: number;
  error?: string;
  /** Times YouTube's bot check stopped this download (it's retried automatically). */
  botRetries?: number;
};

// Starting downloads back to back (e.g. importing a playlist) makes YouTube ask
// "Sign in to confirm you're not a bot". Space out starts, and when it happens anyway,
// pause the queue and retry later instead of failing every item.
const START_GAP_MS = 4000;
const START_JITTER_MS = 3000;
const BOT_BACKOFF_MIN = [2, 5, 10];
const isBotCheck = (message: string) => /not a bot|sign in to confirm/i.test(message);

/** Set while the queue waits after YouTube's bot check. */
export const queuePauseStore = createStore<{ until: number | null }>({ until: null });

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

// yt-dlp reports progress many times a second; only pass on whole-percent changes.
YtDlp.addListener('onProgress', ({ id, progress }) => {
  const current = downloadsStore.get()[id];
  if (progress >= 0 && current && Math.floor(progress) !== Math.floor(current.progress)) patch(id, { progress });
});

/** Strips Expo's "Call to function ... has been rejected. → Caused by:" wrapper. */
export function nativeErrorMessage(e: any): string {
  const raw: string = e?.message ?? String(e);
  const cause = raw.split(/Caused by:\s*/).pop() ?? raw;
  return cause.replace(/^ERROR:\s*/gm, '').trim();
}

let nextStartAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function pumpLater(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    pump();
  }, ms);
}

/** Starts the next queued download if a slot is free, the queue isn't paused and the gap has passed. */
function pump() {
  const now = Date.now();
  const { until } = queuePauseStore.get();
  if (until && now < until) return pumpLater(until - now);
  if (until) queuePauseStore.set({ until: null });

  const all = Object.values(downloadsStore.get());
  const active = all.filter((d) => d.status === 'downloading').length;
  const next = all.find((d) => d.status === 'queued');
  if (!next || active >= settingsStore.get().maxParallel) return;
  if (now < nextStartAt) return pumpLater(nextStartAt - now);

  nextStartAt = now + START_GAP_MS + Math.random() * START_JITTER_MS;
  void run(next);
  pump(); // schedules the next start, if any
}

async function run({ key, item, kind, height, botRetries = 0 }: DownloadState) {
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
    else if (isBotCheck(message) && botRetries < BOT_BACKOFF_MIN.length) {
      // Put it back in the queue and hold everything for a while.
      patch(key, { status: 'queued', progress: 0, botRetries: botRetries + 1 });
      const until = Date.now() + BOT_BACKOFF_MIN[botRetries] * 60_000;
      queuePauseStore.set((s) => ({ until: Math.max(s.until ?? 0, until) }));
    } else patch(key, { status: 'error', error: message });
  }
  pump();
}

let askedForNotifications = false;

// Android 13+ hides the download progress notification without this permission.
// Downloads still continue in the background either way.
function askForNotifications() {
  if (askedForNotifications || Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  askedForNotifications = true;
  PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
}

/**
 * Queues a download. Returns 'saved' if that exact version is already in the library and
 * 'busy' if it's already downloading, so nothing gets downloaded twice.
 */
export function enqueueDownload(item: SearchResult, kind: MediaKind, height = 0): 'queued' | 'saved' | 'busy' {
  const key = downloadKey(item.id, kind, height);
  if (libraryStore.get().some((t) => t.key === key)) return 'saved';
  const existing = downloadsStore.get()[key];
  if (existing && existing.status !== 'error') return 'busy';
  askForNotifications();
  downloadsStore.set((prev) => ({
    ...prev,
    [key]: { key, item, kind, height, status: 'queued', progress: 0 },
  }));
  pump();
  return 'queued';
}

export function retryDownload(key: string) {
  const d = downloadsStore.get()[key];
  if (d) enqueueDownload(d.item, d.kind, d.height);
}

/** Skip the wait after YouTube's bot check (from the Downloads view). */
export function resumeQueueNow() {
  queuePauseStore.set({ until: null });
  nextStartAt = 0;
  pump();
}

export function cancelDownload(key: string) {
  const d = downloadsStore.get()[key];
  if (d?.status === 'downloading') YtDlp.cancel(key);
  else remove(key);
}
