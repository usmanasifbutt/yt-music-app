import { Image } from 'expo-image';
import { useVideoPlayer, VideoPlayer, VideoSource, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YtDlp, { downloadKey } from '../../modules/yt-dlp';
import { enqueueDownload, nativeErrorMessage } from '../downloads';
import { libraryStore, Track } from '../library';
import {
  asSearchResult,
  attachVideo,
  clearSleepTimer,
  cycleRepeat,
  isStream,
  moveInQueue,
  next,
  playAt,
  playerStore,
  previous,
  removeFromQueue,
  retryCurrent,
  seek,
  setRate,
  setSleepTimer,
  showAudio,
  showVideo,
  SPEEDS,
  togglePlay,
  toggleShuffle,
  videoProgress,
} from '../player';
import { settingsStore, updateSettings } from '../settings';
import { useStore, useStoreValue } from '../store';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { DownloadButton } from './DownloadButton';
import { DownloadSheet } from './DownloadSheet';
import { Icon, IconName } from './Icon';
import { Artwork, Button, IconButton } from './kit';
import { Sheet, SheetItem } from './Sheet';
import { colors, formatTime, glow, radius, space, type } from './theme';

/** Saved locally: the song itself, or (for a stream) its downloaded audio. */
function useSaved(track: Track | undefined) {
  return useStoreValue(libraryStore, (tracks) =>
    !!track && (!isStream(track) || tracks.some((t) => t.key === downloadKey(track.videoId, 'audio')))
  );
}

export function MiniPlayer() {
  const { queue, index, playing, position, duration, loading, error } = useStore(playerStore);
  const [open, setOpen] = useState(false);
  const track = queue[index];
  const saved = useSaved(track);
  if (!track) return null;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;

  function close() {
    showAudio(); // a video keeps playing as audio once Now Playing closes
    setOpen(false);
  }

  return (
    <>
      <Pressable style={styles.mini} onPress={() => setOpen(true)}>
        <View style={styles.miniTrack}>
          <View style={[styles.miniFill, { width: `${pct}%` }]} />
        </View>
        <View style={styles.miniRow}>
          <Artwork uris={[track.thumbnailPath]} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={type.labelLg} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={[type.bodySm, error && { color: colors.accent }]} numberOfLines={1}>
              {error ? "Couldn't play · tap ▶ to retry" : loading ? 'Getting stream…' : track.artist}
            </Text>
          </View>
          {track.videoId && !saved && <DownloadButton item={asSearchResult(track)} size={36} />}
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ width: 40 }} />
          ) : (
            <IconButton name={error ? 'refresh' : playing ? 'pause' : 'play-arrow'} size={30} color={colors.accent} onPress={togglePlay} />
          )}
          <IconButton name="skip-next" size={28} onPress={() => void next()} />
        </View>
      </Pressable>
      <Modal statusBarTranslucent navigationBarTranslucent visible={open} animationType="slide" onRequestClose={close}>
        <NowPlaying onClose={close} />
      </Modal>
    </>
  );
}

function sleepLabel(sleepAt: number | null, atTrackEnd: boolean) {
  if (atTrackEnd) return 'Track end';
  if (!sleepAt) return 'Sleep';
  return `${Math.max(1, Math.ceil((sleepAt - Date.now()) / 60_000))}m`;
}

function NowPlaying({ onClose }: { onClose: () => void }) {
  const { queue, index, playing, position, duration, shuffle, repeat, rate, sleepAt, sleepAtTrackEnd, source, loading, error, mode } =
    useStore(playerStore);
  const autoplay = useStoreValue(settingsStore, (s) => s.autoplay);
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<'queue' | 'sleep' | 'speed' | null>(null);
  const [addKeys, setAddKeys] = useState<string[] | null>(null);
  const [options, setOptions] = useState(false);
  const track = queue[index];
  const saved = useSaved(track);
  if (!track) return null;
  const sleepOn = !!sleepAt || sleepAtTrackEnd;
  const upNext = queue[index + 1];
  const online = !!track.videoId;

  return (
    <View style={[styles.full, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.topBar}>
        <IconButton name="keyboard-arrow-down" size={30} onPress={onClose} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[type.labelSm, { color: colors.accent, letterSpacing: 1 }]} numberOfLines={1}>
            {source ? `PLAYING FROM ${source.toUpperCase()}` : 'NOW PLAYING'}
          </Text>
          <Text style={type.labelLg}>Now Playing</Text>
        </View>
        {online ? <IconButton name="more-vert" onPress={() => setOptions(true)} /> : <View style={{ width: 40 }} />}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.lg }}>
        {online && <ModeToggle mode={mode} onChange={(m) => (m === 'video' ? showVideo() : showAudio())} />}

        <View style={styles.media}>
          {mode === 'video' ? <VideoPane key={track.key} track={track} /> : <Cover track={track} loading={loading} />}
        </View>

        <View style={styles.titleRow}>
          <Text style={[type.headlineMd, { flexShrink: 1 }]} numberOfLines={2}>
            {track.title}
          </Text>
          {online && (saved ? <StateChip icon="download-done" label="Downloaded" tone="success" /> : <StateChip icon="cell-tower" label="Streaming" />)}
        </View>
        <Text style={[type.bodyLg, { color: colors.muted, marginTop: 4 }]} numberOfLines={1}>
          {track.artist}
        </Text>

        {error && mode === 'audio' && (
          <View style={styles.errorCard}>
            <View style={styles.errorTop}>
              <View style={styles.errorIcon}>
                <Icon name="cloud-off" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={type.headlineSm}>{"Couldn't play this song"}</Text>
                <Text style={[type.bodySm, { marginTop: 4 }]} numberOfLines={6}>
                  {error}
                </Text>
              </View>
            </View>
            <View style={styles.errorButtons}>
              <Button label="Try again" icon="refresh" onPress={retryCurrent} style={{ flex: 1 }} />
              <Button
                label="Download"
                icon="file-download"
                variant="secondary"
                onPress={() => enqueueDownload(asSearchResult(track), 'audio')}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}

        <Seekbar position={position} duration={duration} />

        <View style={styles.controls}>
          <IconButton name="shuffle" color={shuffle ? colors.accent : colors.muted} onPress={toggleShuffle} />
          <IconButton name="skip-previous" size={36} onPress={previous} />
          <Pressable style={[styles.playFab, loading && styles.playFabBusy]} onPress={togglePlay} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.onAccent} size="large" />
            ) : (
              <Icon name={error && mode === 'audio' ? 'refresh' : playing ? 'pause' : 'play-arrow'} size={40} color={colors.onAccent} />
            )}
          </Pressable>
          <IconButton name="skip-next" size={36} onPress={() => void next()} />
          <IconButton
            name={repeat === 'one' ? 'repeat-one' : 'repeat'}
            color={repeat !== 'off' ? colors.accent : colors.muted}
            onPress={cycleRepeat}
          />
        </View>

        <View style={styles.actions}>
          {online && <DownloadButton item={asSearchResult(track)} size={52} showPercent onLongPress={() => setOptions(true)} />}
          <RoundAction icon="playlist-add" label="Save" disabled={isStream(track) && !saved} onPress={() => setAddKeys([track.key])} />
          <RoundAction icon="speed" label={`${rate}×`} active={rate !== 1} onPress={() => setSheet('speed')} />
          <RoundAction icon="bedtime" label={sleepLabel(sleepAt, sleepAtTrackEnd)} active={sleepOn} onPress={() => setSheet('sleep')} />
          <RoundAction icon="queue-music" label="Queue" onPress={() => setSheet('queue')} />
        </View>

        <Pressable style={styles.upNext} onPress={() => setSheet('queue')}>
          <View style={styles.upNextHeader}>
            <Text style={[type.labelSm, { color: colors.accent, letterSpacing: 1 }]}>UP NEXT</Text>
            {autoplay && <Text style={type.bodySm}>· Autoplay on</Text>}
            <View style={{ flex: 1 }} />
            <Text style={[type.labelMd, { color: colors.accent }]}>View all ({queue.length})</Text>
          </View>
          {upNext ? (
            <View style={styles.upNextRow}>
              <Artwork uris={[upNext.thumbnailPath]} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={type.labelLg} numberOfLines={1}>
                  {upNext.title}
                </Text>
                <Text style={type.bodySm} numberOfLines={1}>
                  {upNext.artist} · {formatTime(upNext.duration)}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={type.bodySm}>{autoplay && online ? 'Related songs will follow.' : 'End of the queue.'}</Text>
          )}
        </Pressable>
      </ScrollView>

      <Sheet visible={sheet === 'speed'} title="Playback speed" onClose={() => setSheet(null)}>
        {SPEEDS.map((s) => (
          <SheetItem
            key={s}
            icon={s === rate ? 'check' : 'blank'}
            label={s === 1 ? 'Normal' : `${s}×`}
            onPress={() => {
              setRate(s);
              setSheet(null);
            }}
          />
        ))}
      </Sheet>

      <Sheet
        visible={sheet === 'sleep'}
        title="Sleep timer"
        subtitle={sleepOn ? `Stops: ${sleepLabel(sleepAt, sleepAtTrackEnd)}` : 'Pause playback after…'}
        onClose={() => setSheet(null)}>
        {[15, 30, 45, 60].map((m) => (
          <SheetItem
            key={m}
            icon="timer"
            label={`${m} minutes`}
            onPress={() => {
              setSleepTimer(m);
              setSheet(null);
            }}
          />
        ))}
        <SheetItem
          icon="music-off"
          label="End of this track"
          onPress={() => {
            setSleepTimer('track');
            setSheet(null);
          }}
        />
        {sleepOn && (
          <SheetItem
            icon="close"
            label="Turn off"
            destructive
            onPress={() => {
              clearSleepTimer();
              setSheet(null);
            }}
          />
        )}
      </Sheet>

      <Sheet visible={sheet === 'queue'} title="Up next" subtitle={`${queue.length} in queue`} onClose={() => setSheet(null)}>
        <FlatList
          data={queue}
          style={{ flexShrink: 1 }}
          keyExtractor={(t, i) => `${t.key}-${i}`}
          initialScrollIndex={Math.max(0, index - 2)}
          getItemLayout={(_, i) => ({ length: QUEUE_ROW, offset: QUEUE_ROW * i, index: i })}
          renderItem={({ item, index: i }) => (
            <Pressable style={[styles.queueRow, i === index && { backgroundColor: colors.surfaceHigh }]} onPress={() => playAt(i)}>
              <Artwork uris={[item.thumbnailPath]} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={[type.labelLg, i === index && { color: colors.accent }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={type.bodySm} numberOfLines={1}>
                  {i === index ? 'Playing now' : `${item.artist} · ${formatTime(item.duration)}`}
                </Text>
              </View>
              <IconButton name="arrow-upward" size={20} color={colors.muted} disabled={i === 0} onPress={() => moveInQueue(i, -1)} />
              <IconButton
                name="arrow-downward"
                size={20}
                color={colors.muted}
                disabled={i === queue.length - 1}
                onPress={() => moveInQueue(i, 1)}
              />
              <IconButton name="close" size={20} color={colors.faint} onPress={() => removeFromQueue(i)} />
            </Pressable>
          )}
        />
      </Sheet>
      <AddToPlaylistSheet keys={addKeys} onClose={() => setAddKeys(null)} />
      <DownloadSheet item={options && online ? asSearchResult(track) : null} onClose={() => setOptions(false)} />
    </View>
  );
}

function ModeToggle({ mode, onChange }: { mode: 'audio' | 'video'; onChange: (m: 'audio' | 'video') => void }) {
  const items: { value: 'audio' | 'video'; label: string; icon: IconName }[] = [
    { value: 'audio', label: 'Audio', icon: 'headphones' },
    { value: 'video', label: 'Video', icon: 'videocam' },
  ];
  return (
    <View style={styles.toggle}>
      {items.map((i) => {
        const active = i.value === mode;
        return (
          <Pressable key={i.value} style={[styles.toggleItem, active && styles.toggleActive]} onPress={() => !active && onChange(i.value)}>
            <Icon name={i.icon} size={20} color={active ? colors.onAccent : colors.muted} />
            <Text style={[type.labelLg, { color: active ? colors.onAccent : colors.muted }]}>{i.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StateChip({ icon, label, tone }: { icon: IconName; label: string; tone?: 'success' }) {
  const color = tone === 'success' ? colors.success : colors.muted;
  return (
    <View style={[styles.chip, tone === 'success' && { backgroundColor: colors.successSoft, borderColor: 'transparent' }]}>
      <Icon name={icon} size={14} color={color} />
      <Text style={[type.labelSm, { color }]}>{label}</Text>
    </View>
  );
}

/** Square card: the 16:9 YouTube thumbnail over a blurred copy of itself. */
function Cover({ track, loading }: { track: Track; loading: boolean }) {
  const uri = track.thumbnailPath;
  return (
    <View style={styles.cover}>
      {uri ? (
        <>
          <Image source={{ uri }} style={styles.fill} contentFit="cover" blurRadius={24} cachePolicy="memory-disk" />
          <View style={[styles.fill, { backgroundColor: colors.overlaySoft }]} />
          <Image source={{ uri }} style={styles.coverImage} contentFit="contain" cachePolicy="memory-disk" transition={150} />
        </>
      ) : (
        <Icon name="music-note" size={72} color={colors.faint} />
      )}
      {loading && (
        <View style={[styles.fill, styles.coverBusy]}>
          <ActivityIndicator color={colors.accent} size="large" />
          <View style={styles.busyChip}>
            <View style={styles.busyDot} />
            <Text style={[type.labelMd, { letterSpacing: 1 }]}>GETTING STREAM…</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * The Video side of the switch: plays the song's video (the downloaded one if you have it,
 * otherwise streamed) from the current second. The player's controls below drive it.
 * Mounted per song (key), so each song starts with a fresh loading state.
 */
function VideoPane({ track }: { track: Track }) {
  const local = useStoreValue(libraryStore, (tracks) =>
    tracks
      .filter((t) => t.videoId === track.videoId && t.kind === 'video')
      .sort((a, b) => b.height - a.height)[0]?.uri ?? null
  );
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Set once the video has really played, so a "playback ended" event can be trusted. */
  const played = useRef(false);
  /** Chosen quality (max height, 0 = adapt), remembered in Settings. */
  const quality = useStoreValue(settingsStore, (s) => s.videoQuality);
  const [qualities, setQualities] = useState<number[]>([]);
  const [height, setHeight] = useState(0);
  const [picker, setPicker] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const view = useRef<VideoView>(null);
  /** Where to continue after switching quality (the song's position otherwise). */
  const resumeAt = useRef<number | null>(null);
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
  });

  useEffect(() => {
    attachVideo(player);
    const subs = [
      player.addListener('timeUpdate', ({ currentTime }) => {
        if (currentTime > 1) played.current = true;
        videoProgress(currentTime, player.duration, player.playing);
      }),
      player.addListener('playingChange', ({ isPlaying }) => videoProgress(player.currentTime, player.duration, isPlaying)),
      player.addListener('playToEnd', () => {
        // Only a video that actually played can finish. An empty or failed player also reports
        // "ended"; moving on then would race through the whole list.
        if (played.current) void next(true);
        else if (player.status === 'readyToPlay') {
          setStatus('error');
          setError('The video stopped right after starting. Try again, or go back to audio.');
        }
      }),
      player.addListener('statusChange', ({ status: s, error: e }) => {
        if (s === 'readyToPlay') setStatus('ready');
        if (s === 'error') {
          setStatus('error');
          setError(e?.message ?? 'The video stopped loading.');
        }
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      attachVideo(null);
    };
  }, [player]);

  useEffect(() => {
    let active = true;
    const startAt = resumeAt.current ?? playerStore.get().position;
    resumeAt.current = null;
    (async () => {
      try {
        let source: VideoSource;
        if (local) source = { uri: local };
        else {
          const s = await YtDlp.stream(track.videoId, 'video', quality);
          if (!active) return;
          setQualities(s.qualities);
          setHeight(s.height);
          source = { uri: s.url, headers: s.headers, contentType: s.hls ? 'hls' : 'progressive' };
        }
        if (active) await startVideo(player, source, startAt);
      } catch (e) {
        if (!active) return;
        setStatus('error');
        setError(nativeErrorMessage(e));
      }
    })();
    return () => {
      active = false;
    };
    // `local` changing mid-video (a download finishing) shouldn't restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, attempt, quality]);

  function chooseQuality(q: number) {
    setPicker(false);
    if (q === quality) return;
    resumeAt.current = player.currentTime;
    played.current = false; // the reload may report "ended" for the old source
    setStatus('loading');
    updateSettings({ videoQuality: q });
  }

  function retry() {
    YtDlp.forgetInfo(track.videoId); // ask YouTube for fresh links
    played.current = false;
    setStatus('loading');
    setError(null);
    setAttempt((a) => a + 1);
  }

  return (
    <View style={styles.videoBox}>
      <VideoView
        ref={view}
        player={player}
        style={styles.fill}
        contentFit="contain"
        // The app's own controls sit below the video; full screen gets the native ones.
        nativeControls={fullscreen}
        fullscreenOptions={{ enable: true, orientation: 'landscape' }}
        onFullscreenEnter={() => setFullscreen(true)}
        onFullscreenExit={() => setFullscreen(false)}
      />
      {status === 'ready' && (
        <View style={styles.videoBar}>
          {qualities.length > 0 && !local && (
            <Pressable style={styles.videoChip} onPress={() => setPicker(true)} hitSlop={6}>
              <Icon name="tune" size={16} color={colors.text} />
              <Text style={type.labelMd}>{quality === 0 ? 'Auto' : `${height}p`}</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable style={styles.videoChip} onPress={() => void view.current?.enterFullscreen()} hitSlop={6}>
            <Icon name="fullscreen" size={20} color={colors.text} />
          </Pressable>
        </View>
      )}
      <Sheet visible={picker} title="Video quality" subtitle="Higher uses more data" onClose={() => setPicker(false)}>
        <SheetItem icon={quality === 0 ? 'check' : 'blank'} label="Auto" detail="Adapts to your connection" onPress={() => chooseQuality(0)} />
        {[...qualities].reverse().map((q) => (
          <SheetItem key={q} icon={quality === q ? 'check' : 'blank'} label={`${q}p`} onPress={() => chooseQuality(q)} />
        ))}
      </Sheet>
      {status !== 'ready' && (
        <View style={[styles.fill, styles.coverBusy]}>
          {status === 'loading' ? (
            <>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={[type.labelMd, { letterSpacing: 1 }]}>LOADING VIDEO…</Text>
            </>
          ) : (
            <>
              <Icon name="videocam-off" size={36} color={colors.accent} />
              <Text style={[type.bodySm, { textAlign: 'center', paddingHorizontal: space.md }]} numberOfLines={4}>
                {error}
              </Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Try again" icon="refresh" onPress={retry} />
                <Button label="Back to audio" variant="secondary" onPress={showAudio} />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

/** expo-video is driven by setting properties on its player, so this lives outside the component. */
async function startVideo(player: VideoPlayer, source: VideoSource, startAt: number) {
  await player.replaceAsync(source);
  if (startAt > 1) player.currentTime = startAt;
  player.playbackRate = playerStore.get().rate;
  player.play();
}

/** Draggable progress bar: drag or tap anywhere to seek; the time follows your finger. */
function Seekbar({ position, duration }: { position: number; duration: number }) {
  const bar = useRef<View>(null);
  const geometry = useRef({ x: 0, width: 1 });
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const [drag, setDrag] = useState<number | null>(null);

  const responder = useMemo(() => {
    const ratioAt = (pageX: number) => Math.max(0, Math.min(1, (pageX - geometry.current.x) / geometry.current.width));
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setDrag(ratioAt(e.nativeEvent.pageX)),
      onPanResponderMove: (e) => setDrag(ratioAt(e.nativeEvent.pageX)),
      onPanResponderRelease: (e) => {
        const ratio = ratioAt(e.nativeEvent.pageX);
        setDrag(null);
        if (durationRef.current) seek(ratio * durationRef.current);
      },
      onPanResponderTerminate: () => setDrag(null),
    });
  }, []);

  const ratio = drag ?? (duration ? Math.min(1, position / duration) : 0);
  const shown = drag !== null ? drag * duration : position;
  return (
    <View style={{ marginTop: space.lg }}>
      <View
        ref={bar}
        style={styles.seekHit}
        onLayout={() => bar.current?.measureInWindow((x, _y, width) => (geometry.current = { x, width: width || 1 }))}
        {...responder.panHandlers}>
        <View style={styles.seekTrack}>
          <View style={[styles.seekFill, { width: `${ratio * 100}%` }]} />
        </View>
        <View style={[styles.thumb, drag !== null && styles.thumbActive, { left: `${ratio * 100}%` }]} />
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shown)}</Text>
        <Text style={styles.time}>{duration ? `-${formatTime(Math.max(0, duration - shown))}` : formatTime(duration)}</Text>
      </View>
    </View>
  );
}

function RoundAction({
  icon,
  label,
  active,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = disabled ? colors.faint : active ? colors.accent : colors.text;
  return (
    <Pressable style={styles.roundAction} onPress={onPress} disabled={disabled} hitSlop={4}>
      <View style={[styles.roundIcon, active && { backgroundColor: colors.accentSoft }]}>
        <Icon name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.roundLabel, { color: active ? colors.accent : disabled ? colors.faint : colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const QUEUE_ROW = 64;

const styles = StyleSheet.create({
  mini: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  miniTrack: { height: 2, backgroundColor: colors.border },
  miniFill: { height: 2, backgroundColor: colors.accent },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 62, paddingLeft: space.md, paddingRight: space.sm },
  full: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: space.md,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  toggleItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, height: 44, borderRadius: radius.pill },
  toggleActive: { backgroundColor: colors.accent },
  media: { marginVertical: space.lg },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: glow.artwork,
  },
  coverImage: { width: '100%', aspectRatio: 16 / 9 },
  coverBusy: { alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.overlay },
  busyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
  busyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  videoBar: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  videoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    minWidth: 32,
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.overlay,
  },
  videoBox: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.videoLetterbox },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorCard: { marginTop: space.md, padding: space.md, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  errorTop: { flexDirection: 'row', gap: 12 },
  errorIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorButtons: { flexDirection: 'row', gap: space.sm },
  seekHit: { height: 28, justifyContent: 'center' },
  seekTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  seekFill: { height: 4, backgroundColor: colors.accent },
  thumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: colors.text,
    boxShadow: glow.thumb,
  },
  thumbActive: { width: 20, height: 20, marginLeft: -10, borderRadius: 10 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...type.bodySm, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  playFab: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: glow.fab,
  },
  playFabBusy: { opacity: 0.7 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: space.lg },
  roundAction: { alignItems: 'center', gap: 4, minWidth: 56 },
  roundIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundLabel: { fontSize: 12, fontWeight: '600' },
  upNext: { marginTop: space.lg, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: space.sm },
  upNextHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  queueRow: { height: QUEUE_ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 8 },
});
