import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cycleRepeat,
  next,
  playerStore,
  previous,
  seek,
  togglePlay,
  toggleShuffle,
} from '../player';
import { useStore } from '../store';
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
          <Pressable style={common.iconButton} onPress={togglePlay}>
            <Text style={common.iconText}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>
          <Pressable style={common.iconButton} onPress={() => next()}>
            <Text style={common.iconText}>⏭</Text>
          </Pressable>
        </View>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <FullPlayer onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { queue, index, playing, position, duration, shuffle, repeat } = useStore(playerStore);
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(1);
  const track = queue[index];
  if (!track) return null;
  const pct = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <View style={[styles.full, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}>
      <Pressable style={common.iconButton} onPress={onClose}>
        <Text style={[common.iconText, { fontSize: 24 }]}>⌄</Text>
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
          <Text style={[styles.small, shuffle && { color: colors.accent }]}>⇄</Text>
        </Pressable>
        <Pressable style={common.iconButton} onPress={previous}>
          <Text style={styles.big}>⏮</Text>
        </Pressable>
        <Pressable style={styles.playButton} onPress={togglePlay}>
          <Text style={[styles.big, { color: colors.bg }]}>{playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <Pressable style={common.iconButton} onPress={() => next()}>
          <Text style={styles.big}>⏭</Text>
        </Pressable>
        <Pressable style={common.iconButton} onPress={cycleRepeat}>
          <Text style={[styles.small, repeat !== 'off' && { color: colors.accent }]}>
            {repeat === 'one' ? '↻1' : '↻'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.queueInfo}>
        {index + 1} of {queue.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mini: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  miniProgress: { height: 2, backgroundColor: colors.accent },
  miniThumb: { width: 44, height: 44, borderRadius: 4, backgroundColor: colors.surfaceHigh },
  full: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  artWrap: { alignItems: 'center', marginVertical: 24 },
  art: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.surfaceHigh,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  artist: { color: colors.muted, fontSize: 15, marginTop: 4 },
  seekHit: { paddingVertical: 14, marginTop: 20 },
  seekTrack: { height: 4, backgroundColor: colors.surfaceHigh, borderRadius: 2, overflow: 'hidden' },
  seekFill: { height: 4, backgroundColor: colors.text },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  big: { color: colors.text, fontSize: 28 },
  small: { color: colors.muted, fontSize: 22 },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueInfo: { color: colors.muted, textAlign: 'center', marginTop: 16, fontSize: 12 },
});
