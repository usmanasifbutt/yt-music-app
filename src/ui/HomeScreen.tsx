import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SearchResult } from '../../modules/yt-dlp';
import { homeStore, OnlineRow, refreshHome } from '../home';
import { interestsStore } from '../interests';
import { libraryStore, Track } from '../library';
import { playerStore, playList } from '../player';
import { playlistsStore, playlistTracks } from '../playlists';
import { useStore } from '../store';
import { DownloadSheet } from './DownloadSheet';
import { Icon } from './Icon';
import { InterestPicker } from './InterestPicker';
import { colors, common, formatTime } from './theme';
import { VideoPlayerModal } from './VideoPlayer';

const LOCAL_ROW = 10;

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
  const recentlyAdded = useMemo(() => library.slice(0, LOCAL_ROW), [library]); // library is newest first
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

  // Tapping something already saved plays it; otherwise offer the download options.
  function openOnline(item: SearchResult) {
    const saved = library.find((t) => t.videoId === item.id && t.kind === 'audio');
    if (saved) playList([saved], 0);
    else setSelected(item);
  }

  const onlineRows = rows.filter((r) => r.items.length || r.status === 'loading');
  const nothingAtAll = !onlineRows.length && !library.length;

  return (
    <>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}>
        <View style={styles.topBar}>
          <Text style={styles.hint}>{interests?.length ? 'Picked for you' : 'Pick interests to fill Home'}</Text>
          <Pressable style={styles.editButton} onPress={() => setPickerOpen(true)} hitSlop={8}>
            <Icon name="tune" size={18} color={colors.text} />
            <Text style={styles.editText}>Interests</Text>
          </Pressable>
        </View>

        {recentlyPlayed.length > 0 && (
          <Section title="Continue listening">
            <LocalRow tracks={recentlyPlayed} onOpen={(t) => openLocal(t, recentlyPlayed)} />
          </Section>
        )}

        {onlineRows.map((row) => (
          <Section key={row.key} title={row.title} loading={row.status === 'loading' && row.items.length > 0}>
            <OnlineRowView row={row} library={library} onOpen={openOnline} onDownload={setSelected} />
          </Section>
        ))}

        {recentlyAdded.length > 0 && (
          <Section title="Recently downloaded">
            <LocalRow tracks={recentlyAdded} onOpen={(t) => openLocal(t, recentlyAdded)} />
          </Section>
        )}

        {playlistCards.length > 0 && (
          <Section title="Your playlists">
            <FlatList
              horizontal
              data={playlistCards}
              keyExtractor={(p) => String(p.playlist.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rowContent}
              renderItem={({ item }) => {
                const cover = item.tracks.find((t) => t.thumbnailPath)?.thumbnailPath;
                return (
                  <Pressable style={styles.squareCard} onPress={() => playList(item.tracks, 0)}>
                    {cover ? <Image source={{ uri: cover }} style={styles.square} /> : <View style={styles.square} />}
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.playlist.name}
                    </Text>
                    <Text style={styles.cardSub}>{item.tracks.length} items</Text>
                  </Pressable>
                );
              }}
            />
          </Section>
        )}

        {nothingAtAll && (
          <Text style={common.empty}>
            {interests?.length
              ? "Couldn't load suggestions. Check your connection and pull down to refresh."
              : 'Tap Interests to choose what you like, or find something in Search.'}
          </Text>
        )}
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
        <Text style={styles.sectionTitle} numberOfLines={1}>
          {title}
        </Text>
        {loading && <Icon name="sync" size={16} color={colors.muted} />}
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
              <Image source={{ uri: item.thumbnail }} style={styles.wide} />
              {item.duration ? <Text style={styles.duration}>{formatTime(item.duration)}</Text> : null}
              {saved && (
                <View style={styles.savedBadge}>
                  <Icon name="check" size={14} color="#fff" />
                </View>
              )}
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
  const { queue, index } = useStore(playerStore);
  const playingKey = queue[index]?.key;
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
            {item.thumbnailPath ? (
              <Image source={{ uri: item.thumbnailPath }} style={styles.square} />
            ) : (
              <View style={styles.square} />
            )}
            {item.kind === 'video' && (
              <View style={styles.savedBadge}>
                <Icon name="movie" size={14} color="#fff" />
              </View>
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  hint: { color: colors.muted, fontSize: 13 },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  editText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  section: { marginTop: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  rowContent: { paddingHorizontal: 16, gap: 12 },
  wideCard: { width: 168 },
  wide: { width: 168, height: 94.5, borderRadius: 8, backgroundColor: colors.surfaceHigh },
  squareCard: { width: 128 },
  square: { width: 128, height: 128, borderRadius: 8, backgroundColor: colors.surfaceHigh },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 6 },
  cardSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  duration: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 4,
    borderRadius: 3,
    overflow: 'hidden',
  },
  savedBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    backgroundColor: colors.success,
    borderRadius: 10,
    padding: 2,
  },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: colors.surface, marginTop: 8, width: '85%' },
});
