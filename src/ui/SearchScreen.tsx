import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import { downloadKey, search, SearchResponse, SearchResult } from '../../modules/yt-dlp';
import { downloadsStore, enqueueDownload, nativeErrorMessage } from '../downloads';
import { getSetting, libraryStore, setSetting } from '../library';
import { createPlaylist } from '../playlists';
import { useStore } from '../store';
import { DownloadSheet } from './DownloadSheet';
import { Icon } from './Icon';
import { colors, common, formatTime } from './theme';

const PAGE = 25;
const MAX_RESULTS = 100;
const MAX_RECENT = 10;

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [playlist, setPlaylist] = useState<SearchResponse['playlist']>(null);

  function importPlaylist() {
    if (!playlist || !results.length) return;
    const saved = new Set(libraryStore.get().map((t) => t.key));
    const missing = results.filter((r) => !saved.has(downloadKey(r.id, 'audio')));
    Alert.alert(
      'Save as playlist?',
      `Creates "${playlist.title}" with ${results.length} songs` +
        (missing.length ? ` and downloads ${missing.length} as audio.` : '.'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: () => {
            createPlaylist(
              playlist.title,
              results.map((r) => downloadKey(r.id, 'audio'))
            );
            missing.forEach((r) => enqueueDownload(r, 'audio'));
            ToastAndroid.show(`Saving "${playlist.title}" — see Library → Playlists`, ToastAndroid.LONG);
          },
        },
      ]
    );
  }
  const downloads = Object.values(useStore(downloadsStore));
  const library = useStore(libraryStore);

  const [recent, setRecent] = useState<string[]>(() => getSetting<string[]>('recentSearches', []));
  const [lastQuery, setLastQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [loadingMore, setLoadingMore] = useState(false);

  function saveRecent(next: string[]) {
    setRecent(next);
    setSetting('recentSearches', next);
  }

  async function runSearch(text = query) {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    try {
      const response = await search(q, PAGE);
      setResults(response.results);
      setPlaylist(response.playlist);
      setLastQuery(q);
      setLimit(PAGE);
      // Links aren't worth remembering as searches.
      if (!/^https?:\/\//i.test(q)) saveRecent([q, ...recent.filter((r) => r !== q)].slice(0, MAX_RECENT));
    } catch (e: any) {
      setError(nativeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // yt-dlp search has no paging, so ask for more results and keep the new ones.
  async function loadMore() {
    if (loadingMore || !lastQuery) return;
    setLoadingMore(true);
    try {
      const response = await search(lastQuery, limit + PAGE);
      const seen = new Set(results.map((r) => r.id));
      setResults([...results, ...response.results.filter((r) => !seen.has(r.id))]);
      setLimit(limit + PAGE);
    } catch (e: any) {
      ToastAndroid.show(nativeErrorMessage(e), ToastAndroid.LONG);
    } finally {
      setLoadingMore(false);
    }
  }

  const canLoadMore = !playlist && results.length >= limit && limit < MAX_RESULTS;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Search YouTube or paste a link"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable
            style={styles.clear}
            hitSlop={8}
            onPress={() => {
              setQuery('');
              setResults([]);
              setPlaylist(null);
              setError(null);
            }}>
            <Icon name="close" size={20} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {!loading && playlist && results.length > 0 && (
        <View style={styles.playlistBanner}>
          <View style={{ flex: 1 }}>
            <Text style={common.title} numberOfLines={1}>
              {playlist.title}
            </Text>
            <Text style={common.subtitle}>YouTube playlist · {results.length} videos</Text>
          </View>
          <Pressable style={styles.saveButton} onPress={importPlaylist}>
            <Text style={styles.saveText}>Save as playlist</Text>
          </Pressable>
        </View>
      )}
      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />}
      {error && <Text style={[common.empty, { color: colors.accent }]}>{error}</Text>}

      <FlatList
        data={loading ? [] : results}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading || error ? null : recent.length ? (
            <View>
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Recent searches</Text>
                <Pressable onPress={() => saveRecent([])} hitSlop={8}>
                  <Text style={styles.recentClear}>Clear</Text>
                </Pressable>
              </View>
              {recent.map((r) => (
                <Pressable key={r} style={styles.recentRow} onPress={() => runSearch(r)}>
                  <Icon name="history" size={20} color={colors.muted} />
                  <Text style={styles.recentText} numberOfLines={1}>
                    {r}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => saveRecent(recent.filter((x) => x !== r))}>
                    <Icon name="close" size={18} color={colors.muted} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={common.empty}>Search for something, then tap ⬇ to save audio or video offline.</Text>
          )
        }
        ListFooterComponent={
          !loading && canLoadMore ? (
            <Pressable style={styles.more} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <Text style={styles.moreText}>Load more</Text>
              )}
            </Pressable>
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
                  <Icon name="file-download" size={26} />
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
  searchBar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, justifyContent: 'center' },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 24,
    paddingLeft: 18,
    paddingRight: 44,
    paddingVertical: 12,
    fontSize: 16,
  },
  clear: { position: 'absolute', right: 30, top: 8, bottom: 8, justifyContent: 'center' },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  recentTitle: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  recentClear: { color: colors.accent, fontSize: 13 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  recentText: { color: colors.text, fontSize: 15, flex: 1 },
  more: { alignItems: 'center', paddingVertical: 18 },
  moreText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  // YouTube thumbnails are 16:9.
  thumb: { width: 96, height: 54, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  badge: { color: colors.success, fontSize: 12, marginTop: 3 },
  playlistBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  saveButton: { backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  progress: { color: colors.text, fontSize: 13, fontVariant: ['tabular-nums'] },
});
