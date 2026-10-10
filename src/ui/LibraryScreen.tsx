import { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import YtDlp from '../../modules/yt-dlp';
import { cancelDownload, downloadsStore, nativeErrorMessage, retryDownload } from '../downloads';
import { libraryStore, Track } from '../library';
import {
  applyView,
  FILTER_OPTIONS,
  FilterKey,
  formatBytes,
  loadSort,
  setSort,
  SORT_OPTIONS,
  sortStore,
  STALE_DAYS,
  staleTracks,
  totalSize,
} from '../libraryView';
import { playerStore, playList } from '../player';
import { playlistsStore } from '../playlists';
import { useStore } from '../store';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { PlaylistDetail, PlaylistsList } from './PlaylistScreens';
import { Sheet, SheetItem } from './Sheet';
import { colors, common } from './theme';
import { confirmDeleteTracks, TrackMenu } from './TrackMenu';
import { TrackRow } from './TrackRow';
import { VideoPlayerModal } from './VideoPlayer';

type Segment = 'songs' | 'videos' | 'playlists';

export function LibraryScreen() {
  const [segment, setSegment] = useState<Segment>('songs');
  const [openPlaylist, setOpenPlaylist] = useState<number | null>(null);

  // Android back closes an open playlist instead of leaving the app.
  useEffect(() => {
    if (openPlaylist === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setOpenPlaylist(null);
      return true;
    });
    return () => sub.remove();
  }, [openPlaylist]);

  if (segment === 'playlists' && openPlaylist !== null) {
    return <PlaylistDetail id={openPlaylist} onBack={() => setOpenPlaylist(null)} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.segments}>
        {(['songs', 'videos', 'playlists'] as const).map((s) => (
          <Pressable key={s} onPress={() => setSegment(s)} style={[styles.chip, segment === s && styles.chipActive]}>
            <Text style={[styles.chipText, segment === s && styles.chipTextActive]}>
              {s === 'songs' ? 'Songs' : s === 'videos' ? 'Videos' : 'Playlists'}
            </Text>
          </Pressable>
        ))}
      </View>
      {segment === 'playlists' ? (
        <PlaylistsList onOpen={setOpenPlaylist} />
      ) : (
        <TrackList key={segment} kind={segment === 'songs' ? 'audio' : 'video'} />
      )}
    </View>
  );
}

function TrackList({ kind }: { kind: 'audio' | 'video' }) {
  const library = useStore(libraryStore);
  const playlists = useStore(playlistsStore);
  const sort = useStore(sortStore);
  const { queue, index } = useStore(playerStore);
  const playingKey = queue[index]?.key;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [addKeys, setAddKeys] = useState<string[] | null>(null);
  const [video, setVideo] = useState<Track | null>(null);

  useEffect(loadSort, []);

  const all = useMemo(() => library.filter((t) => t.kind === kind), [library, kind]);
  const shown = useMemo(
    () => applyView(all, { sort, filter, query }, playlists),
    [all, sort, filter, query, playlists]
  );

  useEffect(() => {
    if (!selection) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(null);
      return true;
    });
    return () => sub.remove();
  }, [selection]);

  function toggle(key: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next.size ? next : null;
    });
  }

  function open(track: Track, i: number) {
    if (selection) return toggle(track.key);
    if (track.kind === 'video') setVideo(track);
    else playList(shown, i); // the queue follows the current sort/filter
  }

  const selected = shown.filter((t) => selection?.has(t.key));
  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label;
  const noun = kind === 'audio' ? 'songs' : 'videos';

  return (
    <>
      {selection ? (
        <View style={styles.selectionBar}>
          <Pressable style={common.iconButton} onPress={() => setSelection(null)}>
            <Text style={common.iconText}>✕</Text>
          </Pressable>
          <Text style={styles.selectionCount}>{selection.size} selected</Text>
          <Pressable
            style={styles.pill}
            onPress={() => setSelection(selection.size === shown.length ? null : new Set(shown.map((t) => t.key)))}>
            <Text style={styles.pillText}>{selection.size === shown.length ? 'None' : 'All'}</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={() => setAddKeys([...selection])}>
            <Text style={styles.pillText}>+ Playlist</Text>
          </Pressable>
          <Pressable style={styles.pill} onPress={() => confirmDeleteTracks(selected, () => setSelection(null))}>
            <Text style={[styles.pillText, { color: colors.accent }]}>Delete</Text>
          </Pressable>
        </View>
      ) : (
        all.length > 0 && (
          <View>
            <View style={styles.toolbar}>
              <TextInput
                style={styles.search}
                placeholder={`Search ${noun}`}
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              <Pressable
                style={[styles.pill, filter === 'recent' && { opacity: 0.5 }]}
                disabled={filter === 'recent'}
                onPress={() => setSortOpen(true)}>
                <Text style={styles.pillText}>⇅ {filter === 'recent' ? 'Last played' : sortLabel}</Text>
              </Pressable>
            </View>
            <View style={styles.filters}>
              {FILTER_OPTIONS.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}>
                  <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )
      )}
      <FlatList
        data={shown}
        keyExtractor={(t) => t.key}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          selection ? null : (
            <LibraryHeader
              kind={kind}
              shown={shown}
              total={all.length}
              onStorage={() => setStorageOpen(true)}
            />
          )
        }
        ListEmptyComponent={
          <Text style={common.empty}>
            {all.length === 0
              ? kind === 'audio'
                ? 'No songs yet. Find something in Search and tap ⬇.'
                : 'No videos yet. In Search, tap ⬇ and pick a video quality.'
              : `No ${noun} match.`}
          </Text>
        }
        renderItem={({ item, index: i }) => (
          <TrackRow
            track={item}
            playing={item.key === playingKey}
            selected={selection ? selection.has(item.key) : undefined}
            onPress={() => open(item, i)}
            onLongPress={() => toggle(item.key)}
            onMenu={() => setMenuTrack(item)}
          />
        )}
      />

      <Sheet visible={sortOpen} title="Sort by" onClose={() => setSortOpen(false)}>
        {SORT_OPTIONS.map((o) => (
          <SheetItem
            key={o.key}
            icon={o.key === sort ? '✓' : ''}
            label={o.label}
            onPress={() => {
              setSort(o.key);
              setSortOpen(false);
            }}
          />
        ))}
      </Sheet>
      <StorageSheet visible={storageOpen} onClose={() => setStorageOpen(false)} />
      <TrackMenu
        track={menuTrack}
        onClose={() => setMenuTrack(null)}
        onAddToPlaylist={(t) => setAddKeys([t.key])}
      />
      <AddToPlaylistSheet
        keys={addKeys}
        onClose={() => {
          setAddKeys(null);
          setSelection(null);
        }}
      />
      <VideoPlayerModal track={video} onClose={() => setVideo(null)} />
    </>
  );
}

function StorageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const library = useStore(libraryStore);
  const audio = library.filter((t) => t.kind === 'audio');
  const videos = library.filter((t) => t.kind === 'video');
  const stale = staleTracks(library);

  return (
    <Sheet
      visible={visible}
      title={`Storage · ${formatBytes(totalSize(library))}`}
      subtitle="Downloads in Music/YT Music and Movies/YT Music"
      onClose={onClose}>
      <SheetItem icon="♫" label={`${audio.length} songs`} detail={formatBytes(totalSize(audio))} onPress={() => {}} />
      <SheetItem icon="▶" label={`${videos.length} videos`} detail={formatBytes(totalSize(videos))} onPress={() => {}} />
      <SheetItem
        icon="🗑"
        destructive
        disabled={!stale.length}
        label={stale.length ? `Delete ${stale.length} not played in ${STALE_DAYS}+ days` : `Nothing unplayed for ${STALE_DAYS}+ days`}
        detail={stale.length ? formatBytes(totalSize(stale)) : undefined}
        onPress={() => {
          onClose();
          confirmDeleteTracks(stale);
        }}
      />
    </Sheet>
  );
}

function LibraryHeader({
  kind,
  shown,
  total,
  onStorage,
}: {
  kind: 'audio' | 'video';
  shown: Track[];
  total: number;
  onStorage: () => void;
}) {
  const downloads = Object.values(useStore(downloadsStore)).filter((d) => d.kind === kind);
  const [updating, setUpdating] = useState(false);
  const noun = kind === 'audio' ? (total === 1 ? 'song' : 'songs') : total === 1 ? 'video' : 'videos';

  async function updateEngine() {
    setUpdating(true);
    try {
      const status = await YtDlp.update();
      const version = await YtDlp.version();
      Alert.alert(
        'Download engine',
        status === 'ALREADY_UP_TO_DATE' ? `Already up to date (${version})` : `Updated to ${version}`
      );
    } catch (e: any) {
      Alert.alert('Update failed', nativeErrorMessage(e));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={onStorage} hitSlop={8}>
          <Text style={styles.count}>
            {shown.length === total ? `${total} ${noun}` : `${shown.length} of ${total} ${noun}`} ·{' '}
            {formatBytes(totalSize(shown))} ›
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={styles.pill} onPress={updateEngine} disabled={updating}>
            <Text style={styles.pillText}>{updating ? 'Updating…' : 'Update engine'}</Text>
          </Pressable>
          {kind === 'audio' && shown.length > 0 && (
            <Pressable style={[styles.pill, { backgroundColor: colors.accent }]} onPress={() => playList(shown, 0)}>
              <Text style={[styles.pillText, { color: '#fff' }]}>▶ Play</Text>
            </Pressable>
          )}
        </View>
      </View>
      {downloads.map((d) => (
        <View key={d.key} style={common.row}>
          <Pressable
            style={{ flex: 1 }}
            disabled={d.status !== 'error'}
            onPress={() => Alert.alert('Download failed', d.error)}>
            <Text style={common.title} numberOfLines={1}>
              {d.item.title}
            </Text>
            <Text style={[common.subtitle, d.status === 'error' && { color: colors.accent }]} numberOfLines={2}>
              {d.kind === 'audio' ? 'Audio' : `Video ${d.height}p`} ·{' '}
              {d.status === 'error'
                ? d.error
                : d.status === 'queued'
                  ? 'Waiting…'
                  : `Downloading ${Math.round(d.progress)}%`}
            </Text>
            {d.status === 'downloading' && (
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.max(2, d.progress)}%` }]} />
              </View>
            )}
            {d.status === 'error' && <Text style={styles.hint}>Tap for details</Text>}
          </Pressable>
          {d.status === 'error' && (
            <Pressable style={common.iconButton} onPress={() => retryDownload(d.key)}>
              <Text style={common.iconText}>↻</Text>
            </Pressable>
          )}
          <Pressable style={common.iconButton} onPress={() => cancelDownload(d.key)}>
            <Text style={[common.iconText, { color: colors.muted }]}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.text },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextActive: { color: colors.bg, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  search: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
  },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: 'rgba(255,78,69,0.15)' },
  filterText: { color: colors.muted, fontSize: 12 },
  filterTextActive: { color: colors.text, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  count: { color: colors.muted, fontSize: 13 },
  pill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 12,
    paddingVertical: 4,
    backgroundColor: colors.surfaceHigh,
  },
  selectionCount: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  barTrack: {
    height: 3,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: { height: 3, backgroundColor: colors.accent },
  hint: { color: colors.muted, fontSize: 11, marginTop: 2 },
});
