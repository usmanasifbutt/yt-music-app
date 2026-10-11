import { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  cancelDownload,
  DownloadState,
  downloadsStore,
  queuePauseStore,
  resumeQueueNow,
  retryDownload,
} from '../downloads';
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
  totalSize,
} from '../libraryView';
import { playerStore, playList } from '../player';
import { playlistsStore } from '../playlists';
import { useStore, useStoreValue } from '../store';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { Icon } from './Icon';
import { Artwork, Badge, Button, Chip, ChipRow, EmptyState, IconButton, ProgressBar } from './kit';
import { PlaylistDetail, PlaylistsList } from './PlaylistScreens';
import { Sheet, SheetItem } from './Sheet';
import { colors, LIST_BOTTOM, radius, space, type } from './theme';
import { confirmDeleteTracks, TrackMenu } from './TrackMenu';
import { TrackRow } from './TrackRow';
import { VideoPlayerModal } from './VideoPlayer';

type Segment = 'songs' | 'videos' | 'playlists' | 'downloads';

export function LibraryScreen({ onGoSearch }: { onGoSearch: () => void }) {
  const [segment, setSegment] = useState<Segment>('songs');
  const [openPlaylist, setOpenPlaylist] = useState<number | null>(null);
  // Count only, so Songs/Videos don't re-render on every download progress tick.
  const downloadCount = useStoreValue(downloadsStore, (s) => Object.keys(s).length);

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
      <ChipRow style={{ paddingBottom: space.sm }}>
        <Chip label="Songs" icon="music-note" active={segment === 'songs'} onPress={() => setSegment('songs')} />
        <Chip label="Videos" icon="smart-display" active={segment === 'videos'} onPress={() => setSegment('videos')} />
        <Chip label="Playlists" icon="queue-music" active={segment === 'playlists'} onPress={() => setSegment('playlists')} />
        <Chip
          label="Downloads"
          icon="file-download"
          count={downloadCount}
          active={segment === 'downloads'}
          onPress={() => setSegment('downloads')}
        />
      </ChipRow>
      {segment === 'playlists' ? (
        <PlaylistsList onOpen={setOpenPlaylist} />
      ) : segment === 'downloads' ? (
        <DownloadsList onGoSearch={onGoSearch} />
      ) : (
        <TrackList key={segment} kind={segment === 'songs' ? 'audio' : 'video'} onGoSearch={onGoSearch} />
      )}
    </View>
  );
}

function TrackList({ kind, onGoSearch }: { kind: 'audio' | 'video'; onGoSearch: () => void }) {
  const library = useStore(libraryStore);
  const playlists = useStore(playlistsStore);
  const sort = useStore(sortStore);
  const playingKey = useStoreValue(playerStore, (s) => s.queue[s.index]?.key);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortOpen, setSortOpen] = useState(false);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [addKeys, setAddKeys] = useState<string[] | null>(null);
  const [video, setVideo] = useState<Track | null>(null);

  useEffect(loadSort, []);

  const all = useMemo(() => library.filter((t) => t.kind === kind), [library, kind]);
  const shown = useMemo(() => applyView(all, { sort, filter, query }, playlists), [all, sort, filter, query, playlists]);
  const source = kind === 'audio' ? 'Songs' : 'Videos';

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
    else playList(shown, i, { source }); // the queue follows the current sort/filter
  }

  if (!all.length) {
    return (
      <EmptyState
        icon={kind === 'audio' ? 'library-music' : 'smart-display'}
        title={kind === 'audio' ? 'No songs yet' : 'No videos yet'}
        text={
          kind === 'audio'
            ? 'Search for songs or paste a YouTube link to start building your offline collection.'
            : 'In Search, tap the download button and pick a video quality.'
        }>
        <Button label="Search for music" icon="search" onPress={onGoSearch} />
      </EmptyState>
    );
  }

  const selected = shown.filter((t) => selection?.has(t.key));
  const sortLabel = filter === 'recent' ? 'Last played' : SORT_OPTIONS.find((o) => o.key === sort)?.label;
  const noun = kind === 'audio' ? 'songs' : 'videos';

  return (
    <>
      {selection ? (
        <View style={styles.selectionBar}>
          <IconButton name="close" onPress={() => setSelection(null)} />
          <Text style={[type.headlineSm, { flex: 1 }]}>{selection.size} selected</Text>
          <Button
            label={selection.size === shown.length ? 'Select none' : 'Select all'}
            variant="secondary"
            onPress={() => setSelection(selection.size === shown.length ? null : new Set(shown.map((t) => t.key)))}
          />
        </View>
      ) : (
        <>
          <View style={styles.search}>
            <Icon name="search" size={20} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Filter your ${noun}`}
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {query ? <IconButton name="close" size={18} color={colors.muted} onPress={() => setQuery('')} /> : null}
          </View>
          <ChipRow style={{ paddingTop: space.sm }}>
            <Chip label={sortLabel ?? ''} icon="swap-vert" onPress={() => filter !== 'recent' && setSortOpen(true)} />
            {FILTER_OPTIONS.map((f) => (
              <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </ChipRow>
        </>
      )}

      <FlatList
        data={shown}
        keyExtractor={(t) => t.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: selection ? 120 : LIST_BOTTOM }}
        ListHeaderComponent={
          selection ? null : (
            <View style={styles.summary}>
              <View style={{ flex: 1 }}>
                <Text style={type.headlineSm}>
                  {shown.length === all.length ? `${all.length} ${noun}` : `${shown.length} of ${all.length}`}
                </Text>
                <View style={styles.offline}>
                  <Icon name="offline-pin" size={14} color={colors.success} />
                  <Text style={[type.bodySm, { color: colors.success }]}>{formatBytes(totalSize(shown))} offline</Text>
                </View>
              </View>
              {kind === 'audio' && shown.length > 0 && (
                <>
                  <Button label="Play all" icon="play-arrow" onPress={() => playList(shown, 0, { shuffle: false, source })} />
                  <IconButton name="shuffle" filled onPress={() => playList(shown, 0, { shuffle: true, source })} />
                </>
              )}
            </View>
          )
        }
        ListEmptyComponent={<Text style={styles.noMatch}>No {noun} match.</Text>}
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

      {selection && (
        <View style={styles.actionBar}>
          <ActionButton icon="playlist-add" label="Add to playlist" onPress={() => setAddKeys([...selection])} />
          {kind === 'audio' && (
            <ActionButton
              icon="play-arrow"
              label={`Play (${selected.length})`}
              primary
              onPress={() => {
                playList(selected, 0, { shuffle: false, source });
                setSelection(null);
              }}
            />
          )}
          <ActionButton
            icon="delete"
            label={`Delete (${selected.length})`}
            danger
            onPress={() => confirmDeleteTracks(selected, () => setSelection(null))}
          />
        </View>
      )}

      <Sheet visible={sortOpen} title="Sort by" onClose={() => setSortOpen(false)}>
        {SORT_OPTIONS.map((o) => (
          <SheetItem
            key={o.key}
            icon={o.key === sort ? 'check' : 'blank'}
            label={o.label}
            onPress={() => {
              setSort(o.key);
              setSortOpen(false);
            }}
          />
        ))}
      </Sheet>
      <TrackMenu track={menuTrack} onClose={() => setMenuTrack(null)} onAddToPlaylist={(t) => setAddKeys([t.key])} />
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

function ActionButton({
  icon,
  label,
  primary,
  danger,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  primary?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = primary ? colors.onAccent : danger ? colors.accent : colors.text;
  return (
    <Pressable onPress={onPress} style={[styles.action, primary && { backgroundColor: colors.accent }]}>
      <Icon name={icon} size={22} color={color} />
      <Text style={[type.labelMd, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Shown while the queue waits after YouTube's "confirm you're not a bot" check. */
function PausedBanner() {
  const { until, stopped } = useStore(queuePauseStore);
  if (!until && !stopped) return null;
  const at = until ? new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <View style={styles.paused}>
      <Icon name={stopped ? 'pause-circle' : 'hourglass-top'} size={22} color={colors.accent} />
      <View style={{ flex: 1 }}>
        <Text style={type.labelLg}>{stopped ? 'YouTube is limiting downloads' : 'YouTube asked to slow down'}</Text>
        <Text style={type.bodySm}>
          {stopped
            ? 'Your songs are kept in the queue. Try again later, or after switching network.'
            : `Downloads continue automatically at ${at}.`}
        </Text>
      </View>
      <Button label={stopped ? 'Resume' : 'Retry now'} variant="secondary" onPress={resumeQueueNow} />
    </View>
  );
}

function DownloadsList({ onGoSearch }: { onGoSearch: () => void }) {
  const downloads: DownloadState[] = Object.values(useStore(downloadsStore));
  if (!downloads.length) {
    return (
      <EmptyState icon="download-done" title="No downloads in progress" text="Everything you download shows up here until it's saved to your library.">
        <Button label="Search for music" icon="search" onPress={onGoSearch} />
      </EmptyState>
    );
  }
  const active = downloads.filter((d) => d.status === 'downloading');
  const waiting = downloads.filter((d) => d.status !== 'downloading');
  return (
    <FlatList
      data={[...active, ...waiting]}
      keyExtractor={(d) => d.key}
      contentContainerStyle={{ paddingBottom: LIST_BOTTOM, gap: space.sm, paddingHorizontal: space.md }}
      ListHeaderComponent={<PausedBanner />}
      renderItem={({ item: d }) => (
        <Pressable
          style={styles.download}
          disabled={d.status !== 'error'}
          onPress={() => Alert.alert('Download failed', d.error)}>
          <View style={styles.downloadTop}>
            <Artwork uris={[d.item.thumbnail]} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyLg} numberOfLines={1}>
                {d.item.title}
              </Text>
              <View style={styles.offline}>
                <Text style={type.bodySm} numberOfLines={1}>
                  {d.item.artist}
                </Text>
                <Badge label={d.kind === 'audio' ? 'Audio' : `Video ${d.height}p`} />
              </View>
            </View>
            {d.status === 'error' && <IconButton name="refresh" color={colors.accent} filled onPress={() => retryDownload(d.key)} />}
            <IconButton name="close" color={colors.muted} filled onPress={() => cancelDownload(d.key)} />
          </View>
          {d.status === 'downloading' ? (
            <>
              <ProgressBar value={d.progress} />
              <Text style={type.bodySm}>{Math.round(d.progress)}%</Text>
            </>
          ) : (
            <Text style={[type.bodySm, d.status === 'error' && { color: colors.accent }]} numberOfLines={2}>
              {d.status === 'error'
                ? `${d.error} · tap for details`
                : d.usedFallback
                  ? 'Waiting · retrying another way'
                  : 'Waiting…'}
            </Text>
          )}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    paddingLeft: 14,
    paddingRight: 4,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  noMatch: { ...type.bodyMd, textAlign: 'center', marginTop: space.xl },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  actionBar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    bottom: space.sm,
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  paused: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  download: {
    gap: space.sm,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  downloadTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
