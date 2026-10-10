import { AudioStatus, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { markPlayed, Track } from './library';
import { createStore } from './store';

export type PlayerState = {
  queue: Track[];
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
};

export const playerStore = createStore<PlayerState>({
  queue: [],
  index: -1,
  playing: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
});

const player = createAudioPlayer(null, { updateInterval: 500 });

export async function setupPlayer() {
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
  player.play();
  const metadata = {
    title: track.title,
    artist: track.artist,
    artworkUrl: track.thumbnailPath ?? undefined,
  };
  player.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true });
}

function onTrackEnd() {
  const { repeat } = playerStore.get();
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
