import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Track } from '../library';
import { Icon } from './Icon';
import { Artwork, Badge, IconButton } from './kit';
import { colors, common, formatTime, radius, type } from './theme';

/** 64px library row: artwork, title, artist · length + format badge, trailing ⋮. */
export function TrackRow({
  track,
  playing,
  selected,
  onPress,
  onLongPress,
  onMenu,
  right,
}: {
  track: Track;
  playing?: boolean;
  /** undefined = not in selection mode. */
  selected?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onMenu?: () => void;
  /** Replaces the ⋮ button (used by the playlist editor). */
  right?: ReactNode;
}) {
  return (
    <Pressable
      style={({ pressed }) => [common.row, selected && styles.selected, pressed && { backgroundColor: colors.surface }]}
      onPress={onPress}
      onLongPress={onLongPress}>
      {selected !== undefined && (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected && <Icon name="check" size={16} color={colors.onAccent} />}
        </View>
      )}
      <View>
        <Artwork uris={[track.thumbnailPath]} size={48} />
        {playing && (
          <View style={styles.playingOverlay}>
            <Icon name="graphic-eq" size={22} color={colors.accent} />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyLg, playing && { color: colors.accent }]} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[type.bodySm, { flexShrink: 1 }]} numberOfLines={1}>
            {track.artist} · {formatTime(track.duration)}
          </Text>
          <Badge label={track.kind === 'video' ? `Video ${track.height}p` : 'Audio'} tone={track.kind === 'video' ? 'success' : 'neutral'} />
        </View>
      </View>
      {right ?? (onMenu && selected === undefined ? <IconButton name="more-vert" color={colors.faint} onPress={onMenu} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  selected: { backgroundColor: colors.accentSoft },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  playingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.md,
    backgroundColor: colors.overlaySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
