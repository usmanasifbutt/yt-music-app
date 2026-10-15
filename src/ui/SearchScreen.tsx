import { Image } from 'expo-image';
import { memo, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';
import YtDlp, { downloadKey, search, SearchResponse, SearchResult } from '../../modules/yt-dlp';
import { enqueueDownload, nativeErrorMessage } from '../downloads';
import { getSetting, libraryStore, setSetting } from '../library';
import { playerStore, playResults } from '../player';
import { playlistNamed } from '../playlists';
import { useStoreValue } from '../store';
import { DownloadButton } from './DownloadButton';
import { DownloadSheet } from './DownloadSheet';
import { createOrMerge } from './playlistNames';
import { Icon } from './Icon';
import { Badge, Button, EmptyState, IconButton } from './kit';
import { colors, formatTime, LIST_BOTTOM, radius, space, type } from './theme';

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
      // Most taps go to the top result: look up its stream now so it starts almost at once.
      const top = response.results[0];
      if (top && !libraryStore.get().some((t) => t.key === downloadKey(top.id, 'audio'))) {
        YtDlp.stream(top.id, 'audio', 0).catch(() => {});
      }
      setLastQuery(q);
      setLimit(PAGE);
      // Links aren't worth remembering as searches.
      if (!/^https?:\/\//i.test(q)) saveRecent([q, ...recent.filter((r) => r !== q)].slice(0, MAX_RECENT));
    } catch (e) {
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
    } catch (e) {
      ToastAndroid.show(nativeErrorMessage(e), ToastAndroid.LONG);
    } finally {
      setLoadingMore(false);
    }
  }

  function clear() {
    setQuery('');
    setResults([]);
    setPlaylist(null);
    setError(null);
  }

  // Tapping a result plays it (streamed unless downloaded), with the rest of the results as Up next.
  // Stable reference so result rows (memoised) don't re-render when the screen does.
  const play = useCallback(
    (index: number) => playResults(results, index, playlist ? `YouTube playlist · ${playlist.title}` : `Search · ${lastQuery}`),
    [results, playlist, lastQuery]
  );

  function importPlaylist() {
    if (!playlist || !results.length) return;
    const saved = new Set(libraryStore.get().map((t) => t.key));
    const missing = results.filter((r) => !saved.has(downloadKey(r.id, 'audio')));
    const keys = results.map((r) => downloadKey(r.id, 'audio'));
    const downloads = missing.length ? ` and download ${missing.length} as audio` : '';

    function save() {
      createOrMerge(
        playlist!.title,
        keys,
        (p) => {
          // Already queued or saved songs are skipped, so importing again never downloads twice.
          missing.forEach((r) => enqueueDownload(r, 'audio'));
          ToastAndroid.show(`Saving "${p.name}" · see Library → Playlists`, ToastAndroid.LONG);
        },
        // Importing the same YouTube playlist again: offer to add its new songs to the one you have.
        `You already have a playlist with this name. Add the missing songs to it${downloads}, or save a separate copy?`
      );
    }

    if (playlistNamed(playlist.title)) return save();
    Alert.alert('Save as playlist?', `Creates "${playlist.title}" with ${results.length} songs${downloads}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: save },
    ]);
  }

  const canLoadMore = !playlist && results.length >= limit && limit < MAX_RESULTS;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchBar}>
        <Icon name="search" size={22} color={colors.muted} />
        <TextInput
          style={styles.input}
          placeholder="Search or paste a YouTube link"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch()}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query.length > 0 && <IconButton name="close" size={20} color={colors.muted} onPress={clear} />}
      </View>

      {!loading && playlist && results.length > 0 && (
        <View style={styles.playlistBanner}>
          <View style={styles.bannerIcon}>
            <Icon name="queue-music" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.labelLg} numberOfLines={1}>
              {playlist.title}
            </Text>
            <Text style={type.bodySm}>YouTube playlist · {results.length} videos</Text>
          </View>
          <Button label="Save" icon="playlist-add" onPress={importPlaylist} />
        </View>
      )}
      {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: space.xl }} />}
      {error && <Text style={[type.bodyMd, styles.error]}>{error}</Text>}

      {!loading && !error && results.length === 0 ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: LIST_BOTTOM }}>
          {recent.length > 0 ? (
            <View style={{ paddingTop: space.sm }}>
              <View style={styles.listHeader}>
                <Text style={[type.labelMd, { color: colors.muted, letterSpacing: 0.8 }]}>RECENT SEARCHES</Text>
                <Pressable onPress={() => saveRecent([])} hitSlop={8}>
                  <Text style={[type.labelLg, { color: colors.accent }]}>Clear</Text>
                </Pressable>
              </View>
              {recent.map((r) => (
                <Pressable key={r} style={styles.recentRow} onPress={() => runSearch(r)}>
                  <Icon name="history" size={20} color={colors.muted} />
                  <Text style={[type.bodyLg, { flex: 1 }]} numberOfLines={1}>
                    {r}
                  </Text>
                  <IconButton name="close" size={18} color={colors.faint} onPress={() => saveRecent(recent.filter((x) => x !== r))} />
                </Pressable>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="graphic-eq"
              title="Discover & download music"
              text="Search YouTube for songs, artists and recitations, or paste a video or playlist link to save it offline."
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={loading ? [] : results}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: LIST_BOTTOM }}
          ListFooterComponent={
            !loading && canLoadMore ? (
              <Button
                label="Load more"
                variant="ghost"
                loading={loadingMore}
                onPress={loadMore}
                style={{ marginVertical: space.md }}
              />
            ) : null
          }
          renderItem={({ item, index }) => <SearchRow item={item} index={index} onPlay={play} onOptions={setSelected} />}
        />
      )}
      <DownloadSheet item={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

/**
 * One result: tap to play, ⋮ or long-press for options. It subscribes to its own playing and
 * saved state, so progress updates re-render only the affected row, not the whole list.
 */
const SearchRow = memo(function SearchRow({
  item,
  index,
  onPlay,
  onOptions,
}: {
  item: SearchResult;
  index: number;
  onPlay: (index: number) => void;
  onOptions: (item: SearchResult) => void;
}) {
  // Primitive selector results: e.g. "Audio,720p" for the versions already saved.
  const savedLabels = useStoreValue(libraryStore, (tracks) =>
    tracks
      .filter((t) => t.videoId === item.id)
      .map((t) => (t.kind === 'audio' ? 'Audio' : `${t.height}p`))
      .join(',')
  );
  const playing = useStoreValue(playerStore, (s) => s.queue[s.index]?.videoId === item.id);
  const saved = savedLabels ? savedLabels.split(',') : [];

  return (
    <Pressable style={styles.row} onPress={() => onPlay(index)} onLongPress={() => onOptions(item)}>
      <View>
        <Image source={{ uri: item.thumbnail }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={120} />
        <Text style={styles.duration}>{formatTime(item.duration)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyLg, playing && { color: colors.accent }]} numberOfLines={2}>
          {playing && <Icon name="graphic-eq" size={16} color={colors.accent} />}
          {playing ? ' ' : ''}
          {item.title}
        </Text>
        <Text style={[type.bodySm, { marginTop: 2 }]} numberOfLines={1}>
          {item.artist}
        </Text>
        {saved.length > 0 && (
          <View style={styles.badges}>
            {saved.map((label) => (
              <Badge key={label} tone="success" label={label} />
            ))}
          </View>
        )}
      </View>
      <DownloadButton item={item} onLongPress={() => onOptions(item)} />
      <IconButton name="more-vert" color={colors.faint} onPress={() => onOptions(item)} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingLeft: space.md,
    paddingRight: 4,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  error: { color: colors.accent, textAlign: 'center', marginTop: space.lg, paddingHorizontal: space.lg },
  playlistBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: space.md, paddingRight: space.sm, height: 52 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.md, paddingVertical: space.sm },
  thumb: { width: 112, height: 63, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  duration: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    ...type.labelSm,
    color: colors.text,
    backgroundColor: colors.overlay,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  badges: { flexDirection: 'row', gap: 4, marginTop: 4 },
  download: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
