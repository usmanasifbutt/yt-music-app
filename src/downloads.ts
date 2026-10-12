import { PermissionsAndroid, Platform, ToastAndroid } from 'react-native';
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
  /** Why it failed; on a queued item, why the last attempt failed (it will be retried). */
  error?: string;
};

// Many downloads in a row (importing a playlist) make YouTube answer "Sign in to confirm
// you're not a bot", on any network. So: space downloads out (much more for big queues), and
// when it happens anyway, pause the whole queue for longer and longer. Songs stay queued,
// never failed, and a success resets the waits.
const GAP_MS = { normal: [4_000, 7_000], bulk: [15_000, 30_000] } as const;
/** More waiting items than this switches to one-at-a-time with the bulk gap. */
const BULK_THRESHOLD = 3;
const BOT_PAUSE_MIN = [5, 15, 30];
// Not "Sign in to confirm" alone: that also starts "Sign in to confirm your age", which waiting won't fix.
const isBotCheck = (message: string) => /not a bot/i.test(message);

export type QueuePause = {
  /** Paused until this time (epoch ms), then resumes on its own. */
  until: number | null;
  /** Stopped after the longest pause; waits for the user to tap Resume. */
  stopped: boolean;
  /** YouTube's message that caused the pause. */
  reason: string | null;
};

export const queuePauseStore = createStore<QueuePause>({ until: null, stopped: false, reason: null });

/** How many bot-check pauses in a row (index into BOT_PAUSE_MIN). Reset by any success. */
let pauseLevel = 0;

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
  const { until, stopped } = queuePauseStore.get();
  if (stopped) return;
  if (until && now < until) return pumpLater(until - now);
  if (until) queuePauseStore.set({ until: null, stopped: false, reason: null });

  const all = Object.values(downloadsStore.get());
  const active = all.filter((d) => d.status === 'downloading').length;
  const queued = all.filter((d) => d.status === 'queued');
  const bulk = queued.length + active > BULK_THRESHOLD;
  const maxParallel = bulk ? 1 : settingsStore.get().maxParallel;
  const next = queued[0];
  if (!next || active >= maxParallel) return;
  if (now < nextStartAt) return pumpLater(nextStartAt - now);

  const [min, max] = bulk ? GAP_MS.bulk : GAP_MS.normal;
  nextStartAt = now + min + Math.random() * (max - min);
  void run(next);
  pump(); // schedules the next start, if any
}

/** YouTube refused with its bot check: wait longer each time. */
function pauseForBotCheck(reason: string) {
  if (pauseLevel >= BOT_PAUSE_MIN.length) {
    queuePauseStore.set({ until: null, stopped: true, reason });
    return;
  }
  const until = Date.now() + BOT_PAUSE_MIN[pauseLevel] * 60_000;
  pauseLevel++;
  queuePauseStore.set((s) => ({ until: Math.max(s.until ?? 0, until), stopped: false, reason }));
}

const othersWaiting = (key: string) =>
  Object.values(downloadsStore.get()).some((d) => d.key !== key && d.status === 'queued');

async function run({ key, item, kind, height }: DownloadState) {
  patch(key, { status: 'downloading', progress: 0, error: undefined });
  try {
    const baseName = `${item.title} - ${item.artist}`;
    const { uri, thumbnailPath, size } = await YtDlp.download(key, item.id, kind, height, baseName);
    pauseLevel = 0;
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
    else if (isBotCheck(message) && othersWaiting(key)) {
      // Keep it queued (with the reason) and hold the whole queue for a while.
      // A lone download just fails, so the error shows right away.
      patch(key, { status: 'queued', progress: 0, error: message });
      pauseForBotCheck(message);
    } else {
      patch(key, { status: 'error', error: message });
      ToastAndroid.show(`Download failed: ${item.title}
${message}`, ToastAndroid.LONG);
    }
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

/** Skip the wait after YouTube's bot check, or restart a stopped queue (Downloads view). */
export function resumeQueueNow() {
  queuePauseStore.set({ until: null, stopped: false, reason: null });
  pauseLevel = 0;
  nextStartAt = 0;
  pump();
}

export function cancelDownload(key: string) {
  const d = downloadsStore.get()[key];
  if (d?.status === 'downloading') YtDlp.cancel(key);
  else remove(key);
}
