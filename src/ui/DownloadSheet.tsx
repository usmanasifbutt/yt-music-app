import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { downloadKey, DownloadOption, downloadOptions, SearchResult, VIDEO_HEIGHTS } from '../../modules/yt-dlp';
import { downloadsStore, enqueueDownload, nativeErrorMessage } from '../downloads';
import { libraryStore } from '../library';
import { useStore } from '../store';
import { Icon, IconName } from './Icon';
import { Badge } from './kit';
import { Sheet } from './Sheet';
import { colors, formatTime, radius, space, type } from './theme';

// Shown immediately while real sizes load (and if loading them fails).
const FALLBACK: DownloadOption[] = [
  { kind: 'audio', height: 0, label: 'Audio · m4a', size: null },
  ...VIDEO_HEIGHTS.map((h) => ({ kind: 'video' as const, height: h, label: `Video · ${h}p`, size: null })),
];

const DESCRIPTION: Record<number, string> = {
  0: 'Original audio, no re-encoding',
  360: 'Data saver',
  720: 'HD · balanced size',
  1080: 'Full HD',
};

const ICON: Record<number, IconName> = { 0: 'music-note', 360: 'sd', 720: 'hd', 1080: 'high-quality' };

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `~${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

export function DownloadSheet({ item, onClose }: { item: SearchResult | null; onClose: () => void }) {
  const [options, setOptions] = useState<DownloadOption[]>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const library = useStore(libraryStore);
  const downloads = useStore(downloadsStore);

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
    <Sheet
      visible
      eyebrow="Download format"
      title={item.title}
      subtitle={note ?? `${item.artist} · ${formatTime(item.duration)}`}
      onClose={onClose}>
      <View style={styles.list}>
        {options.map((o) => {
          const key = downloadKey(item.id, o.kind, o.height);
          const saved = library.some((t) => t.key === key);
          const dl = downloads[key];
          const busy = dl && dl.status !== 'error';
          const size = formatSize(o.size);
          return (
            <Pressable
              key={key}
              disabled={saved || !!busy}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.border }]}
              onPress={() => {
                enqueueDownload(item, o.kind, o.height);
                onClose();
              }}>
              <View style={[styles.optionIcon, o.kind === 'audio' && { backgroundColor: colors.successSoft }]}>
                <Icon name={ICON[o.height] ?? 'movie'} size={22} color={o.kind === 'audio' ? colors.success : colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.labelRow}>
                  <Text style={type.bodyLg}>{o.label}</Text>
                  {saved ? <Badge label="Downloaded" tone="success" /> : o.height === 720 ? <Badge label="Recommended" tone="accent" /> : null}
                </View>
                <Text style={type.bodySm}>
                  {DESCRIPTION[o.height] ?? ''}
                  {size ? ` · ${size}` : loading ? ' · checking size…' : ''}
                </Text>
              </View>
              <View style={[styles.action, saved && { backgroundColor: colors.success }]}>
                {saved ? (
                  <Icon name="check" size={22} color={colors.bg} />
                ) : busy ? (
                  <ActivityIndicator size="small" color={colors.success} />
                ) : (
                  <Icon name="file-download" size={22} color={colors.text} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  action: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
