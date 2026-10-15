import { AudioSource, AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { VideoPlayer } from 'expo-video';
import YtDlp, { downloadKey, mix, SearchResult, thumbnailFor } from '../modules/yt-dlp';
import { nativeErrorMessage } from './downloads';
import { getSetting, libraryStore, markPlayed, setSetting, Track } from './library';
import { settingsStore } from './settings';
import { createStore } from './store';

export type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  /** Playback speed, 1 = normal. Remembered across launches. */
  rate: number;
  /** When the sleep timer pauses playback (epoch ms), or null. */
  sleepAt: number | null;
  /** Sleep timer set to "end of this track". */
  sleepAtTrackEnd: boolean;
  /** Where the queue came from, shown as "Playing from …" (e.g. "Playlist · Gym"). */
  source: string | null;
  /** Looking up the stream of a song that isn't downloaded. */
  loading: boolean;
  /** Why the current song couldn't play. */
  error: string | null;
  /** 'video' while Now Playing shows the video; the audio player waits until it closes. */
  mode: 'audio' | 'video';
};

export const playerStore = createStore<PlayerState>({
  queue: [],
  index: -1,
  playing: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  rate: 1,
  sleepAt: null,
  sleepAtTrackEnd: false,
  source: null,
  loading: false,
  error: null,
  mode: 'audio',
});

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

const player = createAudioPlayer(null, { updateInterval: 500 });
player.shouldCorrectPitch = true; // faster speech without the chipmunk effect

export async function setupPlayer() {
  const rate = getSetting('playbackRate', 1);
  if (SPEEDS.includes(rate)) playerStore.set((s) => ({ ...s, rate }));
  // Lock screen controls on Android require doNotMix; they also keep the
  // foreground service alive so playback survives beyond ~3 min in background.
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
  });
}

// --- Streams: songs played without downloading ---

const STREAM_PREFIX = 'stream:';

/** A queue entry for a song that isn't downloaded; its stream is looked up when it plays. */
export const isStream = (t: Track) => t.key.startsWith(STREAM_PREFIX);

const savedAudio = (videoId: string) => libraryStore.get().find((t) => t.key === downloadKey(videoId, 'audio'));

/** A YouTube result as a queue entry: the downloaded song if you have it, otherwise a stream. */
export function queueTrack(item: SearchResult): Track {
  return (
    savedAudio(item.id) ?? {
      key: STREAM_PREFIX + item.id,
      videoId: item.id,
      kind: 'audio',
      height: 0,
      title: item.title,
      artist: item.artist,
      duration: item.duration,
      uri: '',
      thumbnailPath: item.thumbnail,
      addedAt: 0,
      size: null,
      playCount: 0,
      lastPlayedAt: null,
    }
  );
}

/** The song as a search result, e.g. to download it. */
export const asSearchResult = (t: Track): SearchResult => ({
  id: t.videoId,
  title: t.title,
  artist: t.artist,
  duration: t.duration,
  thumbnail: thumbnailFor(t.videoId),
});

/** Plays YouTube results (search, Home), starting at `startIndex`. */
export function playResults(items: SearchResult[], startIndex: number, source: string) {
  playList(items.map(queueTrack), startIndex, { shuffle: false, source });
}

// A stream that hasn't started after this long has failed (expo-audio reports no error).
const STREAM_TIMEOUT_MS = 20_000;
let watchdog: ReturnType<typeof setTimeout> | null = null;

function clearWatchdog() {
  if (watchdog) clearTimeout(watchdog);
  watchdog = null;
}

// --- Lock screen controls ---

// expo-audio keeps a foreground service (and its notification) alive while the lock screen
// controls are on, even paused and after the app is swiped away, so Android lists the app as
// running for hours. Paused this long, the controls are released; Play brings them back.
const RELEASE_AFTER_PAUSE_MS = 5 * 60_000;
let lockScreen: { title: string; artist: string; artworkUrl?: string } | null = null;
let lockScreenOn = false;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

function showOnLockScreen(metadata: { title: string; artist: string; artworkUrl?: string }) {
  lockScreen = metadata;
  lockScreenOn = true;
  player.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true });
}

function watchPause(playing: boolean) {
  if (playing) {
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = null;
  } else if (lockScreenOn && !releaseTimer) {
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (player.playing) return;
      player.clearLockScreenControls();
      lockScreenOn = false;
    }, RELEASE_AFTER_PAUSE_MS);
  }
}

function resume() {
  if (!lockScreenOn && lockScreen) showOnLockScreen(lockScreen);
  player.play();
}

// --- Playback ---

let pendingSeek: number | null = null;
/** Last error expo-audio reported, so the same one isn't handled twice. */
let lastStatusError: string | null = null;

player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
  watchPause(status.playing);
  if (status.error && status.error !== lastStatusError) {
    lastStatusError = status.error;
    clearWatchdog();
    if (playerStore.get().mode === 'audio' && currentTrack()) {
      playerStore.set((s) => ({ ...s, playing: false, loading: false, error: `Playback stopped: ${status.error}` }));
    }
    return;
  }
  if (status.isLoaded) {
    clearWatchdog();
    if (pendingSeek !== null) {
      void player.seekTo(pendingSeek);
      pendingSeek = null;
    }
  }
  // The video drives the progress while it's shown.
  if (playerStore.get().mode === 'video') return;
  // Updates also arrive while paused; skip the ones that change nothing visible
  // so the player UI doesn't re-render for no reason.
  const s = playerStore.get();
  const duration = status.duration || s.duration;
  if (s.playing !== status.playing || Math.abs(s.position - status.currentTime) >= 0.25 || s.duration !== duration) {
    playerStore.set((prev) => ({ ...prev, playing: status.playing, position: status.currentTime, duration }));
  }
  // Status updates keep arriving while playing (also in the background), so they drive the timer.
  const { sleepAt } = playerStore.get();
  if (sleepAt && Date.now() >= sleepAt && status.playing) {
    player.pause();
    clearSleepTimer();
  }
  if (status.didJustFinish) onTrackEnd();
});

export const currentTrack = () => {
  const { queue, index } = playerStore.get();
  return queue[index] ?? null;
};

/** Each load gets a number, so a slow stream lookup can't start after the user moved on. */
let loadToken = 0;

async function load(index: number, startAt = 0) {
  const track = playerStore.get().queue[index];
  if (!track) return;
  const token = ++loadToken;
  clearWatchdog();
  pendingSeek = null;
  lastStatusError = null;
  playerStore.set((s) => ({ ...s, index, position: startAt, duration: track.duration ?? 0, error: null, loading: false }));
  // Now Playing's video view plays it; the audio picks up when the video closes.
  if (playerStore.get().mode === 'video') return;

  const local = isStream(track) ? savedAudio(track.videoId) : track;
  let source: AudioSource;
  if (local) {
    source = { uri: local.uri };
    markPlayed(local.key);
  } else {
    player.pause();
    playerStore.set((s) => ({ ...s, loading: true }));
    try {
      const stream = await YtDlp.stream(track.videoId, 'audio', 0);
      if (token !== loadToken) return;
      source = { uri: stream.url, headers: stream.headers };
      playerStore.set((s) => ({ ...s, loading: false, duration: stream.duration ?? s.duration }));
    } catch (e) {
      if (token !== loadToken) return;
      playerStore.set((s) => ({ ...s, loading: false, playing: false, error: nativeErrorMessage(e) }));
      return;
    }
    watchdog = setTimeout(() => {
      if (token !== loadToken) return;
      player.pause();
      playerStore.set((s) => ({ ...s, playing: false, error: "The stream didn't start. Check your connection and try again." }));
    }, STREAM_TIMEOUT_MS);
  }

  player.replace(source);
  if (startAt > 0) {
    // Seek now and again once loaded: an early seek can be dropped while the source loads.
    void player.seekTo(startAt);
    pendingSeek = startAt;
  }
  player.setPlaybackRate(playerStore.get().rate);
  player.play();
  showOnLockScreen({ title: track.title, artist: track.artist, artworkUrl: (local ?? track).thumbnailPath ?? undefined });
  prepareAhead(index);
}

/**
 * Gets the next song ready while this one plays: looks up its stream early (so it starts
 * quickly) and, near the end of the queue, adds related songs if autoplay is on.
 */
function prepareAhead(index: number) {
  const { queue } = playerStore.get();
  const upcoming = queue[index + 1];
  if (upcoming && isStream(upcoming) && !savedAudio(upcoming.videoId)) {
    const token = loadToken;
    setTimeout(() => {
      if (token === loadToken) YtDlp.stream(upcoming.videoId, 'audio', 0).catch(() => {});
    }, 5_000);
  }
  if (index >= queue.length - 1) void extendWithMix();
}

let extending: Promise<void> | null = null;

/** Appends YouTube's related songs for the last song in the queue (autoplay). */
function extendWithMix(): Promise<void> {
  const { queue, repeat } = playerStore.get();
  const last = queue[queue.length - 1];
  if (!settingsStore.get().autoplay || repeat === 'all' || !last?.videoId) return Promise.resolve();
  extending ??= (async () => {
    try {
      const items = await mix(last.videoId, 15);
      const have = new Set(playerStore.get().queue.map((t) => t.videoId));
      const fresh = items.filter((i) => !have.has(i.id)).map(queueTrack);
      if (fresh.length) playerStore.set((s) => ({ ...s, queue: [...s.queue, ...fresh] }));
    } catch {
      // Offline or YouTube refused: the queue simply ends.
    } finally {
      extending = null;
    }
  })();
  return extending;
}

/** Tries the current song again, asking YouTube for a fresh stream. */
export function retryCurrent() {
  const track = currentTrack();
  if (!track) return;
  if (track.videoId) YtDlp.forgetInfo(track.videoId);
  void load(playerStore.get().index, playerStore.get().position);
}

function onTrackEnd() {
  const { repeat, sleepAtTrackEnd, position, duration } = playerStore.get();
  // A song that "finishes" seconds into a long track failed (e.g. a broken stream). Stop and
  // say so instead of skipping on, which would race through the whole queue.
  if (position < 5 && duration > 30) {
    playerStore.set((s) => ({ ...s, playing: false, error: 'Playback stopped right after starting. Try again.' }));
    return;
  }
  if (sleepAtTrackEnd) {
    player.pause();
    clearSleepTimer();
    return;
  }
  if (repeat === 'one') {
    player.seekTo(0).then(resume);
    return;
  }
  void next(true);
}

function shuffled(tracks: Track[], first: Track) {
  const rest = tracks.filter((t) => t.key !== first.key);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
}

/**
 * Plays `tracks` starting at `startIndex`, respecting the shuffle setting unless
 * `options.shuffle` overrides it (a playlist's Shuffle button turns shuffle on).
 */
export function playList(
  tracks: Track[],
  startIndex: number,
  options: { shuffle?: boolean; source?: string } = {}
) {
  if (!tracks.length) return;
  const shuffle = options.shuffle ?? playerStore.get().shuffle;
  const start = options.shuffle ? Math.floor(Math.random() * tracks.length) : startIndex;
  const queue = shuffle ? shuffled(tracks, tracks[start]) : tracks;
  playerStore.set((s) => ({ ...s, queue, shuffle, source: options.source ?? null }));
  void load(shuffle ? 0 : start);
}

/** Inserts `track` right after the current one (or starts playing it if nothing is queued). */
export function playNext(track: Track) {
  const { queue, index } = playerStore.get();
  if (index < 0) return playList([track], 0);
  const rest = queue.filter((t, i) => i <= index || t.key !== track.key);
  rest.splice(index + 1, 0, track);
  playerStore.set((s) => ({ ...s, queue: rest }));
}

/** Appends `track` to the end of the queue (or starts playing it if nothing is queued). */
export function addToQueue(track: Track) {
  const { queue, index } = playerStore.get();
  if (index < 0) return playList([track], 0);
  playerStore.set((s) => ({ ...s, queue: [...queue, track] }));
}

export function pausePlayback() {
  player.pause();
  video?.pause();
}

export function togglePlay() {
  const { mode, error } = playerStore.get();
  if (!currentTrack()) return;
  if (mode === 'video' && video) {
    if (video.playing) video.pause();
    else video.play();
  } else if (error) {
    retryCurrent();
  } else if (player.playing) {
    player.pause();
  } else {
    resume();
  }
}

export async function next(auto = false) {
  const { index, repeat } = playerStore.get();
  if (index + 1 >= playerStore.get().queue.length && repeat !== 'all') await extendWithMix();
  const { queue } = playerStore.get();
  if (index + 1 < queue.length) void load(index + 1);
  else if (repeat === 'all' && queue.length) void load(0);
  else if (auto) {
    player.pause();
    video?.pause();
  }
}

export function previous() {
  const { index, mode } = playerStore.get();
  const position = mode === 'video' && video ? video.currentTime : player.currentTime;
  // Like most players: restart the song unless we're near its beginning.
  if (position > 3 || index <= 0) seek(0);
  else void load(index - 1);
}

export function seek(seconds: number) {
  if (playerStore.get().mode === 'video' && video) video.currentTime = seconds;
  else void player.seekTo(seconds);
}

// --- Video mode (Now Playing's Audio | Video switch) ---

let video: VideoPlayer | null = null;

/** Now Playing's video view registers its player, so the controls drive the video. */
export function attachVideo(p: VideoPlayer | null) {
  video = p;
}

/** Called by the video view while it plays. */
export function videoProgress(position: number, duration: number, playing: boolean) {
  const s = playerStore.get();
  if (s.playing !== playing || Math.abs(s.position - position) >= 0.25 || (duration && s.duration !== duration)) {
    playerStore.set((prev) => ({ ...prev, position, playing, duration: duration || prev.duration }));
  }
}

/** Switches Now Playing to the video, continuing from the current second. */
export function showVideo() {
  if (!currentTrack()?.videoId) return;
  clearWatchdog();
  player.pause();
  playerStore.set((s) => ({ ...s, mode: 'video', error: null, loading: false }));
}

/** Back to audio (also when Now Playing closes), continuing from where the video was. */
export function showAudio() {
  const { mode, index, position } = playerStore.get();
  if (mode !== 'video') return;
  const at = video?.currentTime ?? position;
  video?.pause();
  playerStore.set((s) => ({ ...s, mode: 'audio' }));
  void load(index, at);
}

export function toggleShuffle() {
  const { shuffle, queue, index } = playerStore.get();
  const current = queue[index];
  if (!shuffle && current) {
    playerStore.set((s) => ({ ...s, shuffle: true, queue: shuffled(queue, current), index: 0 }));
  } else {
    playerStore.set((s) => ({ ...s, shuffle: !shuffle }));
  }
}

export function cycleRepeat() {
  const order: PlayerState['repeat'][] = ['off', 'all', 'one'];
  playerStore.set((s) => ({ ...s, repeat: order[(order.indexOf(s.repeat) + 1) % order.length] }));
}

export function setRate(rate: number) {
  player.setPlaybackRate(rate);
  playerStore.set((s) => ({ ...s, rate }));
  setSetting('playbackRate', rate);
}

/** `minutes` from now, or 'track' to stop at the end of the current track. */
export function setSleepTimer(when: number | 'track') {
  playerStore.set((s) => ({
    ...s,
    sleepAt: when === 'track' ? null : Date.now() + when * 60_000,
    sleepAtTrackEnd: when === 'track',
  }));
}

export function clearSleepTimer() {
  playerStore.set((s) => ({ ...s, sleepAt: null, sleepAtTrackEnd: false }));
}

/** Jumps to a queue position (from the queue view). */
export function playAt(i: number) {
  void load(i);
}

function stop(queue: Track[]) {
  loadToken++;
  clearWatchdog();
  player.pause();
  video?.pause();
  player.clearLockScreenControls();
  lockScreenOn = false;
  lockScreen = null;
  playerStore.set((s) => ({ ...s, queue, index: -1, playing: false, loading: false, error: null, mode: 'audio' }));
}

export function removeFromQueue(i: number) {
  const { queue, index } = playerStore.get();
  if (i === index) {
    // Removing the current track moves on to the next one, like most players.
    const newQueue = queue.filter((_, j) => j !== i);
    playerStore.set((s) => ({ ...s, queue: newQueue }));
    if (i < newQueue.length) void load(i);
    else stop(newQueue);
    return;
  }
  playerStore.set((s) => ({
    ...s,
    queue: queue.filter((_, j) => j !== i),
    index: i < index ? index - 1 : index,
  }));
}

export function moveInQueue(i: number, direction: -1 | 1) {
  const { queue, index } = playerStore.get();
  const j = i + direction;
  if (j < 0 || j >= queue.length) return;
  const newQueue = [...queue];
  [newQueue[i], newQueue[j]] = [newQueue[j], newQueue[i]];
  const newIndex = index === i ? j : index === j ? i : index;
  playerStore.set((s) => ({ ...s, queue: newQueue, index: newIndex }));
}

/** Removes a deleted track from the queue, skipping ahead if it was playing. */
export function forgetTrack(key: string) {
  const { queue, index } = playerStore.get();
  const removedAt = queue.findIndex((t) => t.key === key);
  if (removedAt < 0) return;
  const newQueue = queue.filter((t) => t.key !== key);
  if (removedAt === index) stop(newQueue);
  else playerStore.set((s) => ({ ...s, queue: newQueue, index: removedAt < index ? index - 1 : index }));
}
