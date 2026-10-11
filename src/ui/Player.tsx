import { useMemo, useRef, useState } from 'react';
import { FlatList, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clearSleepTimer,
  cycleRepeat,
  moveInQueue,
  next,
  playAt,
  playerStore,
  previous,
  removeFromQueue,
  seek,
  setRate,
  setSleepTimer,
  SPEEDS,
  togglePlay,
  toggleShuffle,
} from '../player';
import { useStore } from '../store';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { Icon, IconName } from './Icon';
import { Artwork, IconButton } from './kit';
import { Sheet, SheetItem } from './Sheet';
import { colors, formatTime, glow, radius, space, type } from './theme';

export function MiniPlayer() {
  const { queue, index, playing, position, duration } = useStore(playerStore);
  const [open, setOpen] = useState(false);
  const track = queue[index];
  if (!track) return null;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;

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
            <Text style={type.bodySm} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
          <IconButton name={playing ? 'pause' : 'play-arrow'} size={30} color={colors.accent} onPress={togglePlay} />
          <IconButton name="skip-next" size={28} onPress={() => next()} />
        </View>
      </Pressable>
      <Modal statusBarTranslucent navigationBarTranslucent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <NowPlaying onClose={() => setOpen(false)} />
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
  const { queue, index, playing, position, duration, shuffle, repeat, rate, sleepAt, sleepAtTrackEnd, source } =
    useStore(playerStore);
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<'queue' | 'sleep' | 'speed' | null>(null);
  const [addKeys, setAddKeys] = useState<string[] | null>(null);
  const track = queue[index];
  if (!track) return null;
  const sleepOn = !!sleepAt || sleepAtTrackEnd;
  const upNext = queue.slice(index + 1, index + 4);

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
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.lg }}>
        <View style={styles.artWrap}>
          <ArtworkLarge uri={track.thumbnailPath} />
        </View>

        <Text style={type.headlineMd} numberOfLines={2}>
          {track.title}
        </Text>
        <Text style={[type.bodyLg, { color: colors.muted, marginTop: 4 }]} numberOfLines={1}>
          {track.artist}
        </Text>

        <Seekbar position={position} duration={duration} />

        <View style={styles.controls}>
          <IconButton name="shuffle" color={shuffle ? colors.accent : colors.muted} onPress={toggleShuffle} />
          <IconButton name="skip-previous" size={36} onPress={previous} />
          <Pressable style={styles.playFab} onPress={togglePlay}>
            <Icon name={playing ? 'pause' : 'play-arrow'} size={40} color={colors.onAccent} />
          </Pressable>
          <IconButton name="skip-next" size={36} onPress={() => next()} />
          <IconButton
            name={repeat === 'one' ? 'repeat-one' : 'repeat'}
            color={repeat !== 'off' ? colors.accent : colors.muted}
            onPress={cycleRepeat}
          />
        </View>

        <View style={styles.extras}>
          <Extra icon="speed" label={`${rate}×`} active={rate !== 1} onPress={() => setSheet('speed')} />
          <Extra icon="bedtime" label={sleepLabel(sleepAt, sleepAtTrackEnd)} active={sleepOn} onPress={() => setSheet('sleep')} />
          <Extra icon="playlist-add" label="Save" onPress={() => setAddKeys([track.key])} />
          <Extra icon="queue-music" label={`${index + 1}/${queue.length}`} onPress={() => setSheet('queue')} />
        </View>

        {upNext.length > 0 && (
          <View style={styles.upNext}>
            <View style={styles.upNextHeader}>
              <Text style={type.headlineSm}>Up next</Text>
              <Pressable onPress={() => setSheet('queue')} hitSlop={8}>
                <Text style={[type.labelLg, { color: colors.muted }]}>Full queue</Text>
              </Pressable>
            </View>
            {upNext.map((t, i) => (
              <Pressable key={`${t.key}-${i}`} style={styles.upNextRow} onPress={() => playAt(index + 1 + i)}>
                <Artwork uris={[t.thumbnailPath]} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={type.labelLg} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={type.bodySm} numberOfLines={1}>
                    {t.artist} · {formatTime(t.duration)}
                  </Text>
                </View>
                <IconButton name="close" size={20} color={colors.faint} onPress={() => removeFromQueue(index + 1 + i)} />
              </Pressable>
            ))}
          </View>
        )}
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
    </View>
  );
}

function ArtworkLarge({ uri }: { uri: string | null }) {
  const [width, setWidth] = useState(0);
  return (
    <View style={{ width: '100%' }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && <Artwork uris={[uri]} size={width} />}
    </View>
  );
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
        <Text style={styles.time}>{formatTime(drag !== null ? drag * duration : position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

function Extra({ icon, label, active, onPress }: { icon: IconName; label: string; active?: boolean; onPress: () => void }) {
  const color = active ? colors.accent : colors.muted;
  return (
    <Pressable style={styles.extra} onPress={onPress}>
      <Icon name={icon} size={20} color={color} />
      <Text style={[type.labelMd, { color }]}>{label}</Text>
    </Pressable>
  );
}

const QUEUE_ROW = 64;

const styles = StyleSheet.create({
  mini: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  miniTrack: { height: 2, backgroundColor: colors.border },
  miniFill: { height: 2, backgroundColor: colors.accent },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 62, paddingLeft: space.md, paddingRight: space.sm },
  full: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  artWrap: {
    marginVertical: space.lg,
    borderRadius: radius.md,
    boxShadow: glow.artwork,
  },
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
  extras: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: space.lg,
    padding: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  extra: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  upNext: { marginTop: space.lg, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, gap: space.sm },
  upNextHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  queueRow: { height: QUEUE_ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 8 },
});
