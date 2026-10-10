import { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Track } from '../library';
import { colors, common, formatTime } from './theme';

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
      style={({ pressed }) => [common.row, (pressed || selected) && { backgroundColor: colors.surface }]}
      onPress={onPress}
      onLongPress={onLongPress}>
      {selected !== undefined && (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected && <Text style={styles.checkMark}>✓</Text>}
        </View>
      )}
      <View>
        {track.thumbnailPath ? (
          <Image source={{ uri: track.thumbnailPath }} style={common.thumb} />
        ) : (
          <View style={common.thumb} />
        )}
        {track.kind === 'video' && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>{track.height}p</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[common.title, playing && { color: colors.accent }]} numberOfLines={2}>
          {track.title}
        </Text>
        <Text style={common.subtitle} numberOfLines={1}>
          {track.artist} · {formatTime(track.duration)}
        </Text>
      </View>
      {right ??
        (onMenu && selected === undefined ? (
          <Pressable style={common.iconButton} onPress={onMenu} hitSlop={8}>
            <Text style={[common.iconText, { color: colors.muted }]}>⋮</Text>
          </Pressable>
        ) : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  videoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 3,
    paddingHorizontal: 3,
  },
  videoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
