import { useVideoPlayer, VideoView } from 'expo-video';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Track } from '../library';
import { pausePlayback } from '../player';
import { colors, common } from './theme';

export function VideoPlayerModal({ track, onClose }: { track: Track | null; onClose: () => void }) {
  if (!track) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <VideoScreen track={track} onClose={onClose} />
    </Modal>
  );
}

function VideoScreen({ track, onClose }: { track: Track; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(track.uri, (p) => {
    pausePlayback(); // don't play music over the video
    p.play();
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Pressable style={common.iconButton} onPress={onClose}>
        <Text style={[common.iconText, { fontSize: 24 }]}>⌄</Text>
      </Pressable>
      <View style={styles.videoWrap}>
        <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />
      </View>
      <Text style={styles.title} numberOfLines={3}>
        {track.title}
      </Text>
      <Text style={styles.artist}>
        {track.artist} · {track.height}p
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  videoWrap: { marginTop: 16, backgroundColor: '#000' },
  video: { width: '100%', aspectRatio: 16 / 9 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', paddingHorizontal: 16, marginTop: 16 },
  artist: { color: colors.muted, fontSize: 14, paddingHorizontal: 16, marginTop: 4 },
});
