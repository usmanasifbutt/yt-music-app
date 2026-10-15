import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { downloadKey, SearchResult } from '../../modules/yt-dlp';
import { downloadsStore, enqueueDownload, retryDownload } from '../downloads';
import { libraryStore } from '../library';
import { settingsStore } from '../settings';
import { useStoreValue } from '../store';
import { Icon } from './Icon';
import { colors } from './theme';

/**
 * A circular progress ring without SVG: each half of the ring is a half-coloured circle
 * that rotates into view behind a half-width mask.
 */
export function ProgressRing({ size, progress, color, width = 3 }: { size: number; progress: number; color: string; width?: number }) {
  const p = Math.max(0, Math.min(1, progress / 100));
  const half = size / 2;
  const circle = { width: size, height: size, borderRadius: half, borderWidth: width };
  // Bottom+left borders = the left half of the ring (after the base 45° turn); top+right = the right half.
  const leftHalf = { ...circle, borderColor: 'transparent', borderLeftColor: color, borderBottomColor: color };
  const rightHalf = { ...circle, borderColor: 'transparent', borderTopColor: color, borderRightColor: color };
  return (
    <View style={{ width: size, height: size }}>
      <View style={[circle, { position: 'absolute', borderColor: colors.border }]} />
      <View style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
        <View style={[leftHalf, { position: 'absolute', left: -half, transform: [{ rotate: `${45 + Math.min(p, 0.5) * 360}deg` }] }]} />
      </View>
      {p > 0.5 && (
        <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
          <View style={[rightHalf, { position: 'absolute', left: 0, transform: [{ rotate: `${45 + (p - 0.5) * 360}deg` }] }]} />
        </View>
      )}
    </View>
  );
}

/**
 * Downloads `item` in the format chosen in Settings (audio, or 720p video), in the background:
 * whatever is playing keeps playing. Shows the download's progress as a ring, a check once
 * saved, and the error (with Retry) if it failed. Long-press for every option.
 */
export function DownloadButton({
  item,
  size = 44,
  showPercent = false,
  onLongPress,
}: {
  item: SearchResult;
  size?: number;
  /** Shows "42%" under the button (Now Playing). */
  showPercent?: boolean;
  onLongPress?: () => void;
}) {
  const format = useStoreValue(settingsStore, (s) => s.defaultFormat);
  const key = format === 'audio' ? downloadKey(item.id, 'audio') : downloadKey(item.id, 'video', 720);
  const saved = useStoreValue(libraryStore, (tracks) => tracks.some((t) => t.key === key));
  const status = useStoreValue(downloadsStore, (all) => all[key]?.status ?? null);
  const progress = useStoreValue(downloadsStore, (all) => Math.floor(all[key]?.progress ?? 0));

  function onPress() {
    if (saved) {
      ToastAndroid.show(format === 'audio' ? 'Audio already downloaded' : '720p video already downloaded', ToastAndroid.SHORT);
    } else if (status === 'error') {
      Alert.alert('Download failed', downloadsStore.get()[key]?.error, [
        { text: 'Close', style: 'cancel' },
        { text: 'Retry', onPress: () => retryDownload(key) },
      ]);
    } else if (status) {
      ToastAndroid.show(progress > 0 ? `Downloading · ${progress}%` : 'Starting download…', ToastAndroid.SHORT);
    } else {
      enqueueDownload(item, format, format === 'audio' ? 0 : 720);
      ToastAndroid.show(format === 'audio' ? 'Downloading audio' : 'Downloading 720p video', ToastAndroid.SHORT);
    }
  }

  const inner = size - 8;
  let content;
  if (saved) content = <Icon name="download-done" size={22} color={colors.success} />;
  else if (status === 'error') content = <Icon name="error-outline" size={22} color={colors.accent} />;
  else if (status === 'downloading' && progress > 0)
    content = (
      <>
        <View style={styles.fill}>
          <ProgressRing size={inner} progress={progress} color={colors.success} />
        </View>
        <Icon name="arrow-downward" size={18} color={colors.success} />
      </>
    );
  else if (status) content = <ActivityIndicator size="small" color={colors.success} />;
  else content = <Icon name="file-download" size={22} color={colors.text} />;

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable
        hitSlop={6}
        onPress={onPress}
        onLongPress={onLongPress}
        style={[
          styles.button,
          { width: size, height: size, borderRadius: size / 2 },
          saved && { backgroundColor: colors.successSoft },
          status === 'error' && { backgroundColor: colors.accentSoft },
        ]}>
        {content}
      </Pressable>
      {showPercent && (
        <Text style={[styles.label, { color: saved || status ? colors.success : colors.muted }]}>
          {saved ? 'Saved' : status === 'error' ? 'Failed' : status === 'downloading' && progress > 0 ? `${progress}%` : status ? 'Starting' : 'Download'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  button: { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
});
