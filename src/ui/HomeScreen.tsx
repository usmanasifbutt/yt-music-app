import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SearchResult } from '../../modules/yt-dlp';
import { homeStore, OnlineRow, refreshHome } from '../home';
import { interestsStore } from '../interests';
import { libraryStore, Track } from '../library';
import { playerStore, playList, playResults } from '../player';
import { playlistsStore, playlistTracks } from '../playlists';
import { useStore, useStoreValue } from '../store';
import { DownloadSheet } from './DownloadSheet';
import { InterestPicker } from './InterestPicker';
import { Artwork, Badge, Button, EmptyState, SavedDot } from './kit';
import { colors, formatTime, LIST_BOTTOM, radius, space, type } from './theme';
import { VideoPlayerModal } from './VideoPlayer';

const LOCAL_ROW = 10;
const SQUARE = 128;
const WIDE = 168;

export function HomeScreen() {
  const interests = useStore(interestsStore);
  const rows = useStore(homeStore);
  const library = useStore(libraryStore);
  const playlists = useStore(playlistsStore);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [video, setVideo] = useState<Track | null>(null);

  // Rebuild rows whenever the chosen interests change (including the first pick).
  useEffect(() => {
    if (interests !== null) void refreshHome();
  }, [interests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshHome(true);
    setRefreshing(false);
  }, []);

  const recentlyPlayed = useMemo(
    () =>
      library
        .filter((t) => t.lastPlayedAt)
        .sort((a, b) => b.lastPlayedAt! - a.lastPlayedAt!)
        .slice(0, LOCAL_ROW),
    [library]
  );
  const playlistCards = useMemo(
    () =>
      playlists
        .map((p) => ({ playlist: p, tracks: playlistTracks(p, library) }))
        .filter((p) => p.tracks.length),
    [playlists, library]
  );

  function openLocal(track: Track, row: Track[]) {
    if (track.kind === 'video') return setVideo(track);
    const audio = row.filter((t) => t.kind === 'audio');
    playList(audio, audio.indexOf(track));
  }

  // Plays the row from that song on (streamed unless downloaded); long-press for options.
  function openOnline(row: OnlineRow, item: SearchResult) {
    playResults(row.items, row.items.indexOf(item), row.title);
  }

  const onlineRows = rows.filter((r) => r.items.length || r.status === 'loading');
  const nothingAtAll = !onlineRows.length && !library.length;

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingBottom: LIST_BOTTOM }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
        {/* Only while no interests are chosen (skipped); afterwards they're edited in Settings. */}
        {interests?.length === 0 && !nothingAtAll && (
          <View style={styles.topBar}>
            <View style={styles.hintRow}>
              <View style={styles.dot} />
              <Text style={[type.labelMd, { color: colors.muted, letterSpacing: 0.8 }]}>PICK INTERESTS TO FILL HOME</Text>
            </View>
            <Button label="Interests" icon="tune" variant="secondary" onPress={() => setPickerOpen(true)} />
          </View>
        )}

        {/* Order: recently played → related to it → one row per interest → playlists. */}
        {recentlyPlayed.length > 0 && (
          <Section title="Recently played">
            <LocalRow tracks={recentlyPlayed} onOpen={(t) => openLocal(t, recentlyPlayed)} />
          </Section>
        )}

        {onlineRows.map((row) => (
          <Section key={row.key} title={row.title} loading={row.status === 'loading' && row.items.length > 0}>
            <OnlineRowView row={row} library={library} onOpen={(item) => openOnline(row, item)} onDownload={setSelected} />
          </Section>
        ))}

        {playlistCards.length > 0 && (
          <Section title="Your playlists">
            <FlatList
              horizontal
              data={playlistCards}
              keyExtractor={(p) => String(p.playlist.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rowContent}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.squareCard}
                  onPress={() => playList(item.tracks, 0, { shuffle: false, source: `Playlist · ${item.playlist.name}` })}>
                  <Artwork uris={item.tracks.slice(0, 4).map((t) => t.thumbnailPath)} size={SQUARE} />
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.playlist.name}
                  </Text>
                  <Text style={styles.cardSub}>{item.tracks.length} items</Text>
                </Pressable>
              )}
            />
          </Section>
        )}

        {nothingAtAll &&
          (interests?.length ? (
            <EmptyState
              icon="wifi-off"
              title="Couldn't load suggestions"
              text="Check your connection, then pull down to refresh."
            />
          ) : (
            <EmptyState icon="tune" title="Make Home yours" text="Choose what you listen to and Home fills up with it.">
              <Button label="Choose interests" icon="tune" onPress={() => setPickerOpen(true)} />
            </EmptyState>
          ))}
      </ScrollView>

      <InterestPicker visible={interests === null || pickerOpen} onClose={() => setPickerOpen(false)} />
      <DownloadSheet item={selected} onClose={() => setSelected(null)} />
      <VideoPlayerModal track={video} onClose={() => setVideo(null)} />
    </>
  );
}

function Section({ title, loading, children }: { title: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[type.headlineSm, { flexShrink: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        {loading && <ActivityIndicator size="small" color={colors.muted} />}
      </View>
      {children}
    </View>
  );
}

function OnlineRowView({
  row,
  library,
  onOpen,
  onDownload,
}: {
  row: OnlineRow;
  library: Track[];
  onOpen: (item: SearchResult) => void;
  onDownload: (item: SearchResult) => void;
}) {
  if (!row.items.length) {
    // First load: placeholders instead of an empty gap.
    return (
      <View style={[styles.rowContent, { flexDirection: 'row' }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.wideCard}>
            <View style={styles.wide} />
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, { width: '50%' }]} />
          </View>
        ))}
      </View>
    );
  }
  return (
    <FlatList
      horizontal
      data={row.items}
      keyExtractor={(r) => r.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
      renderItem={({ item }) => {
        const saved = library.some((t) => t.videoId === item.id);
        return (
          <Pressable style={styles.wideCard} onPress={() => onOpen(item)} onLongPress={() => onDownload(item)}>
            <View>
              <Image source={{ uri: item.thumbnail }} style={styles.wide} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              {item.duration ? <Text style={styles.duration}>{formatTime(item.duration)}</Text> : null}
              {saved && <SavedDot />}
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.artist}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

function LocalRow({ tracks, onOpen }: { tracks: Track[]; onOpen: (t: Track) => void }) {
  const playingKey = useStoreValue(playerStore, (s) => s.queue[s.index]?.key);
  return (
    <FlatList
      horizontal
      data={tracks}
      keyExtractor={(t) => t.key}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rowContent}
      renderItem={({ item }) => (
        <Pressable style={styles.squareCard} onPress={() => onOpen(item)}>
          <View>
            <Artwork uris={[item.thumbnailPath]} size={SQUARE} />
            {item.key === playingKey ? (
              <View style={styles.playing}>
                <Badge label="Playing" tone="accent" />
              </View>
            ) : (
              <SavedDot icon={item.kind === 'video' ? 'movie' : 'check'} />
            )}
          </View>
          <Text style={[styles.cardTitle, item.key === playingKey && { color: colors.accent }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {item.artist}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  section: { marginTop: space.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, marginBottom: 12 },
  rowContent: { paddingHorizontal: space.md, gap: 12 },
  wideCard: { width: WIDE },
  wide: { width: WIDE, height: (WIDE * 9) / 16, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  squareCard: { width: SQUARE },
  cardTitle: { ...type.labelLg, marginTop: space.sm },
  cardSub: { ...type.bodySm, marginTop: 2 },
  playing: { position: 'absolute', left: 6, top: 6 },
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
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: colors.surface, marginTop: 8, width: '85%' },
});
