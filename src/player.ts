import { AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { getSetting, markPlayed, setSetting, Track } from './library';
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

player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
  playerStore.set((s) => ({
    ...s,
    playing: status.playing,
    position: status.currentTime,
    duration: status.duration || s.duration,
  }));
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

function load(index: number) {
  const track = playerStore.get().queue[index];
  if (!track) return;
  playerStore.set((s) => ({ ...s, index, position: 0, duration: track.duration ?? 0 }));
  player.replace({ uri: track.uri });
  markPlayed(track.key);
  player.setPlaybackRate(playerStore.get().rate);
  player.play();
  const metadata = {
    title: track.title,
    artist: track.artist,
    artworkUrl: track.thumbnailPath ?? undefined,
  };
  player.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true });
}

function onTrackEnd() {
  const { repeat, sleepAtTrackEnd } = playerStore.get();
  if (sleepAtTrackEnd) {
    player.pause();
    clearSleepTimer();
    return;
  }
  if (repeat === 'one') {
    player.seekTo(0).then(() => player.play());
    return;
  }
  next(true);
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
export function playList(tracks: Track[], startIndex: number, options: { shuffle?: boolean } = {}) {
  if (!tracks.length) return;
  const shuffle = options.shuffle ?? playerStore.get().shuffle;
  const start = options.shuffle ? Math.floor(Math.random() * tracks.length) : startIndex;
  const queue = shuffle ? shuffled(tracks, tracks[start]) : tracks;
  playerStore.set((s) => ({ ...s, queue, shuffle }));
  load(shuffle ? 0 : start);
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
}

export function togglePlay() {
  if (!currentTrack()) return;
  if (player.playing) player.pause();
  else player.play();
}

export function next(auto = false) {
  const { queue, index, repeat } = playerStore.get();
  if (index + 1 < queue.length) load(index + 1);
  else if (repeat === 'all' && queue.length) load(0);
  else if (auto) player.pause();
}

export function previous() {
  const { index } = playerStore.get();
  // Like most players: restart the song unless we're near its beginning.
  if (player.currentTime > 3 || index <= 0) player.seekTo(0);
  else load(index - 1);
}

export function seek(seconds: number) {
  player.seekTo(seconds);
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
  load(i);
}

export function removeFromQueue(i: number) {
  const { queue, index } = playerStore.get();
  if (i === index) {
    // Removing the current track moves on to the next one, like most players.
    const newQueue = queue.filter((_, j) => j !== i);
    playerStore.set((s) => ({ ...s, queue: newQueue }));
    if (i < newQueue.length) load(i);
    else {
      player.pause();
      player.clearLockScreenControls();
      playerStore.set((s) => ({ ...s, index: -1, playing: false }));
    }
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
  if (removedAt === index) {
    player.pause();
    player.clearLockScreenControls();
    playerStore.set((s) => ({ ...s, queue: newQueue, index: -1, playing: false }));
  } else {
    playerStore.set((s) => ({ ...s, queue: newQueue, index: removedAt < index ? index - 1 : index }));
  }
}
