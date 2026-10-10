import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { search, SearchResult } from '../../modules/yt-dlp';
import { downloadsStore, nativeErrorMessage } from '../downloads';
import { libraryStore } from '../library';
import { useStore } from '../store';
import { DownloadSheet } from './DownloadSheet';
import { colors, common, formatTime } from './theme';

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const downloads = Object.values(useStore(downloadsStore));
  const library = useStore(libraryStore);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await search(q));
    } catch (e: any) {
      setError(nativeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search YouTube or paste a link"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>

      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />}
      {error && <Text style={[common.empty, { color: colors.accent }]}>{error}</Text>}

      <FlatList
        data={loading ? [] : results}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={common.empty}>Search for something, then tap ⬇ to save audio or video offline.</Text>
          ) : null
        }
        renderItem={({ item }) => {
          const saved = library.filter((t) => t.videoId === item.id);
          const active = downloads.find((d) => d.item.id === item.id && d.status !== 'error');
          const badge = saved.map((t) => (t.kind === 'audio' ? 'Audio' : `${t.height}p`)).join(' · ');
          return (
            <View style={common.row}>
              <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <Text style={common.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={common.subtitle} numberOfLines={1}>
                  {item.artist} · {formatTime(item.duration)}
                </Text>
                {badge ? <Text style={styles.badge}>✓ {badge}</Text> : null}
              </View>
              <Pressable style={common.iconButton} onPress={() => setSelected(item)}>
                {active ? (
                  active.status === 'queued' ? (
                    <ActivityIndicator color={colors.muted} />
                  ) : (
                    <Text style={styles.progress}>{Math.round(active.progress)}%</Text>
                  )
                ) : (
                  <Text style={common.iconText}>⬇</Text>
                )}
              </Pressable>
            </View>
          );
        }}
      />
      <DownloadSheet item={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
  },
  // YouTube thumbnails are 16:9.
  thumb: { width: 96, height: 54, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  badge: { color: colors.success, fontSize: 12, marginTop: 3 },
  progress: { color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] },
});
