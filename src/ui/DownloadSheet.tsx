import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  downloadKey,
  DownloadOption,
  downloadOptions,
  SearchResult,
  VIDEO_HEIGHTS,
} from '../../modules/yt-dlp';
import { downloadsStore, enqueueDownload, nativeErrorMessage } from '../downloads';
import { libraryStore } from '../library';
import { useStore } from '../store';
import { colors } from './theme';

// Shown immediately while real sizes load (and if loading them fails).
const FALLBACK: DownloadOption[] = [
  { kind: 'audio', height: 0, label: 'Audio · m4a', size: null },
  ...VIDEO_HEIGHTS.map((h) => ({ kind: 'video' as const, height: h, label: `Video · ${h}p`, size: null })),
];

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `~${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export function DownloadSheet({ item, onClose }: { item: SearchResult | null; onClose: () => void }) {
  const [options, setOptions] = useState<DownloadOption[]>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const library = useStore(libraryStore);
  const downloads = useStore(downloadsStore);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!item) return;
    let active = true;
    setOptions(FALLBACK);
    setNote(null);
    setLoading(true);
    downloadOptions(item.id)
      .then((o) => active && setOptions(o))
      .catch((e) => active && setNote(`Couldn't load sizes: ${nativeErrorMessage(e)}`))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [item?.id]);

  if (!item) return null;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.subtitle}>
          {loading ? 'Checking available formats…' : (note ?? 'Choose what to download')}
        </Text>
        {options.map((o) => {
          const key = downloadKey(item.id, o.kind, o.height);
          const saved = library.some((t) => t.key === key);
          const inProgress = downloads[key] && downloads[key].status !== 'error';
          const disabled = saved || !!inProgress;
          return (
            <Pressable
              key={key}
              disabled={disabled}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceHigh }]}
              onPress={() => {
                enqueueDownload(item, o.kind, o.height);
                onClose();
              }}>
              <Text style={styles.icon}>{o.kind === 'audio' ? '♫' : '▶'}</Text>
              <Text style={[styles.label, disabled && { color: colors.muted }]}>{o.label}</Text>
              {loading && !o.size ? (
                <ActivityIndicator size="small" color={colors.muted} />
              ) : (
                <Text style={styles.size}>
                  {saved ? 'Downloaded' : inProgress ? 'Downloading' : formatSize(o.size)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 20,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20 },
  subtitle: { color: colors.muted, fontSize: 13, paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  icon: { color: colors.text, fontSize: 18, width: 22, textAlign: 'center' },
  label: { color: colors.text, fontSize: 15, flex: 1 },
  size: { color: colors.muted, fontSize: 13 },
});
