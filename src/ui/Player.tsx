import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Icon } from './Icon';
import { Sheet, SheetItem } from './Sheet';
import { colors, common, formatTime } from './theme';

export function MiniPlayer() {
  const { queue, index, playing, position, duration } = useStore(playerStore);
  const [open, setOpen] = useState(false);
  const track = queue[index];
  if (!track) return null;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <>
      <Pressable style={styles.mini} onPress={() => setOpen(true)}>
        <View style={[styles.miniProgress, { width: `${pct}%` }]} />
        <View style={[common.row, { paddingVertical: 8 }]}>
          {track.thumbnailPath ? (
            <Image source={{ uri: track.thumbnailPath }} style={styles.miniThumb} />
          ) : (
            <View style={styles.miniThumb} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={common.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={common.subtitle} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
          <Pressable style={common.iconButton} onPress={togglePlay} hitSlop={6}>
            <Icon name={playing ? 'pause' : 'play-arrow'} size={30} />
          </Pressable>
          <Pressable style={common.iconButton} onPress={() => next()} hitSlop={6}>
            <Icon name="skip-next" size={28} />
          </Pressable>
        </View>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <FullPlayer onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function sleepLabel(sleepAt: number | null, atTrackEnd: boolean) {
  if (atTrackEnd) return 'End of track';
  if (!sleepAt) return 'Sleep';
  return `${Math.max(1, Math.ceil((sleepAt - Date.now()) / 60_000))} min`;
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { queue, index, playing, position, duration, shuffle, repeat, rate, sleepAt, sleepAtTrackEnd } =
    useStore(playerStore);
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(1);
  const [sheet, setSheet] = useState<'queue' | 'sleep' | 'speed' | null>(null);
  const track = queue[index];
  if (!track) return null;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;
  const sleepOn = !!sleepAt || sleepAtTrackEnd;

  return (
    <View style={[styles.full, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Pressable style={common.iconButton} onPress={onClose} hitSlop={8}>
        <Icon name="keyboard-arrow-down" size={32} />
      </Pressable>

      <View style={styles.artWrap}>
        {track.thumbnailPath ? (
          <Image source={{ uri: track.thumbnailPath }} style={styles.art} resizeMode="cover" />
        ) : (
          <View style={styles.art} />
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {track.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {track.artist}
      </Text>

      <Pressable
        style={styles.seekHit}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => duration && seek((e.nativeEvent.locationX / barWidth) * duration)}>
        <View style={styles.seekTrack}>
          <View style={[styles.seekFill, { width: `${pct}%` }]} />
        </View>
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>

      <View style={styles.controls}>
        <Pressable style={common.iconButton} onPress={toggleShuffle}>
          <Icon name="shuffle" size={24} color={shuffle ? colors.accent : colors.muted} />
        </Pressable>
        <Pressable style={common.iconButton} onPress={previous}>
          <Icon name="skip-previous" size={38} />
        </Pressable>
        <Pressable style={styles.playButton} onPress={togglePlay}>
          <Icon name={playing ? 'pause' : 'play-arrow'} size={40} color={colors.bg} />
        </Pressable>
        <Pressable style={common.iconButton} onPress={() => next()}>
          <Icon name="skip-next" size={38} />
        </Pressable>
        <Pressable style={common.iconButton} onPress={cycleRepeat}>
          <Icon
            name={repeat === 'one' ? 'repeat-one' : 'repeat'}
            size={24}
            color={repeat !== 'off' ? colors.accent : colors.muted}
          />
        </Pressable>
      </View>

      <View style={styles.extras}>
        <Pressable style={styles.extra} onPress={() => setSheet('speed')}>
          <Icon name="speed" size={20} color={rate !== 1 ? colors.accent : colors.muted} />
          <Text style={[styles.extraText, rate !== 1 && { color: colors.accent }]}>{rate}×</Text>
        </Pressable>
        <Pressable style={styles.extra} onPress={() => setSheet('sleep')}>
          <Icon name="bedtime" size={20} color={sleepOn ? colors.accent : colors.muted} />
          <Text style={[styles.extraText, sleepOn && { color: colors.accent }]}>
            {sleepLabel(sleepAt, sleepAtTrackEnd)}
          </Text>
        </Pressable>
        <Pressable style={styles.extra} onPress={() => setSheet('queue')}>
          <Icon name="queue-music" size={20} color={colors.muted} />
          <Text style={styles.extraText}>
            {index + 1} / {queue.length}
          </Text>
        </Pressable>
      </View>

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
          keyExtractor={(t, i) => `${t.key}-${i}`}
          initialScrollIndex={Math.max(0, index - 2)}
          getItemLayout={(_, i) => ({ length: QUEUE_ROW, offset: QUEUE_ROW * i, index: i })}
          renderItem={({ item, index: i }) => (
            <Pressable style={[styles.queueRow, i === index && { backgroundColor: colors.surfaceHigh }]} onPress={() => playAt(i)}>
              <View style={{ flex: 1 }}>
                <Text style={[common.title, i === index && { color: colors.accent }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={common.subtitle} numberOfLines={1}>
                  {item.artist} · {formatTime(item.duration)}
                </Text>
              </View>
              <Pressable style={styles.queueButton} disabled={i === 0} onPress={() => moveInQueue(i, -1)}>
                <Icon name="arrow-upward" size={20} color={i === 0 ? colors.border : colors.muted} />
              </Pressable>
              <Pressable style={styles.queueButton} disabled={i === queue.length - 1} onPress={() => moveInQueue(i, 1)}>
                <Icon name="arrow-downward" size={20} color={i === queue.length - 1 ? colors.border : colors.muted} />
              </Pressable>
              <Pressable style={styles.queueButton} onPress={() => removeFromQueue(i)}>
                <Icon name="close" size={20} color={colors.muted} />
              </Pressable>
            </Pressable>
          )}
        />
      </Sheet>
    </View>
  );
}

const QUEUE_ROW = 64;

const styles = StyleSheet.create({
  mini: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  miniProgress: { height: 2, backgroundColor: colors.accent },
  miniThumb: { width: 44, height: 44, borderRadius: 4, backgroundColor: colors.surfaceHigh },
  full: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  artWrap: { alignItems: 'center', marginVertical: 20 },
  art: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.surfaceHigh,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  artist: { color: colors.muted, fontSize: 15, marginTop: 4 },
  seekHit: { paddingVertical: 14, marginTop: 16 },
  seekTrack: { height: 4, backgroundColor: colors.surfaceHigh, borderRadius: 2, overflow: 'hidden' },
  seekFill: { height: 4, backgroundColor: colors.text },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extras: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 },
  extraText: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  queueRow: { height: QUEUE_ROW, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8 },
  queueButton: { padding: 8 },
});
