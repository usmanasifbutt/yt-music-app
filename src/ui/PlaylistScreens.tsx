import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { libraryStore, Track } from '../library';
import { formatBytes, totalSize } from '../libraryView';
import { playerStore, playList } from '../player';
import {
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  moveInPlaylist,
  Playlist,
  playlistsStore,
  playlistTracks,
  removeFromPlaylist,
  renamePlaylist,
} from '../playlists';
import { useStore } from '../store';
import { AddToPlaylistSheet } from './AddToPlaylistSheet';
import { Icon } from './Icon';
import { Artwork, Badge, Button, EmptyState, IconButton } from './kit';
import { NameDialog, Sheet, SheetItem } from './Sheet';
import { colors, formatTime, LIST_BOTTOM, radius, space, type } from './theme';
import { TrackMenu } from './TrackMenu';
import { TrackRow } from './TrackRow';
import { VideoPlayerModal } from './VideoPlayer';

const covers = (tracks: Track[]) => tracks.slice(0, 4).map((t) => t.thumbnailPath);
const duration = (tracks: Track[]) => formatTime(tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0));

export function PlaylistsList({ onOpen }: { onOpen: (id: number) => void }) {
  const playlists = useStore(playlistsStore);
  const library = useStore(libraryStore);
  const [creating, setCreating] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);

  return (
    <>
      <FlatList
        data={playlists}
        keyExtractor={(p) => String(p.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ paddingHorizontal: space.md, gap: space.md, paddingBottom: LIST_BOTTOM }}
        onLayout={(e) => setCardWidth((e.nativeEvent.layout.width - space.md * 2 - 12) / 2)}
        ListHeaderComponent={
          playlists.length ? (
            <View style={styles.listHeader}>
              <Text style={type.headlineSm}>
                {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
              </Text>
              <Button label="New" icon="add" onPress={() => setCreating(true)} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="queue-music"
            title="No playlists yet"
            text="Create one here, or use ⋮ → Add to playlist on any song. Long-press songs to select several.">
            <Button label="Create playlist" icon="add" onPress={() => setCreating(true)} />
          </EmptyState>
        }
        renderItem={({ item }) => {
          const tracks = playlistTracks(item, library);
          const pending = item.keys.length - tracks.length;
          return (
            <Pressable style={[styles.card, { width: cardWidth || undefined }]} onPress={() => onOpen(item.id)}>
              {cardWidth > 0 && <Artwork uris={covers(tracks)} size={cardWidth - 16} />}
              <Text style={[type.labelLg, { marginTop: space.sm }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={type.bodySm} numberOfLines={1}>
                {tracks.length} tracks · {duration(tracks)}
                {pending > 0 ? ` · ${pending} downloading` : ''}
              </Text>
            </Pressable>
          );
        }}
      />
      <NameDialog
        visible={creating}
        title="New playlist"
        confirmLabel="Create"
        onCancel={() => setCreating(false)}
        onConfirm={(name) => {
          setCreating(false);
          onOpen(createPlaylist(name));
        }}
      />
    </>
  );
}

export function PlaylistDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const playlist = useStore(playlistsStore).find((p) => p.id === id);
  const library = useStore(libraryStore);
  const { queue, index } = useStore(playerStore);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [addKeys, setAddKeys] = useState<string[] | null>(null);
  const [video, setVideo] = useState<Track | null>(null);

  if (!playlist) return null;
  const tracks = playlistTracks(playlist, library);
  const pending = playlist.keys.length - tracks.length;
  const source = `Playlist · ${playlist.name}`;

  function confirmDelete(p: Playlist) {
    Alert.alert('Delete playlist?', `"${p.name}" will be removed. Songs stay on your device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onBack();
          deletePlaylist(p.id);
        },
      },
    ]);
  }

  return (
    <>
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.key}
        contentContainerStyle={{ paddingBottom: LIST_BOTTOM }}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <IconButton name="arrow-back" onPress={onBack} />
              <View style={{ flex: 1 }} />
              <IconButton name="more-vert" color={colors.muted} onPress={() => setMenuOpen(true)} />
            </View>
            <View style={styles.hero}>
              <Artwork uris={covers(tracks)} size={120} />
              <View style={{ flex: 1, gap: 4 }}>
                <Badge label="Offline" tone="success" />
                <Text style={type.headlineMd} numberOfLines={2}>
                  {playlist.name}
                </Text>
                <Text style={type.bodyMd}>
                  {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · {duration(tracks)}
                </Text>
                <View style={styles.offline}>
                  <Icon name="offline-pin" size={14} color={colors.success} />
                  <Text style={[type.bodySm, { color: colors.success }]}>
                    {pending > 0 ? `${pending} downloading` : `${formatBytes(totalSize(tracks))} downloaded`}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                label="Play all"
                icon="play-arrow"
                disabled={!tracks.length}
                onPress={() => playList(tracks, 0, { shuffle: false, source })}
              />
              <Button
                label="Shuffle"
                icon="shuffle"
                variant="secondary"
                disabled={!tracks.length}
                onPress={() => playList(tracks, 0, { shuffle: true, source })}
              />
              <View style={{ flex: 1 }} />
              {tracks.length > 1 && (
                <IconButton name={editing ? 'check' : 'swap-vert'} filled color={editing ? colors.accent : colors.text} onPress={() => setEditing((e) => !e)} />
              )}
            </View>
            {editing && (
              <View style={styles.hint}>
                <Icon name="info-outline" size={18} color={colors.muted} />
                <Text style={[type.bodySm, { flex: 1 }]}>Use the arrows to change the playback order.</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={[type.bodyMd, styles.emptyText]}>
            {pending ? 'Songs will appear here as they finish downloading.' : 'This playlist is empty.'}
          </Text>
        }
        ListFooterComponent={
          editing ? null : (
            <Pressable style={styles.addSongs} onPress={() => setAdding(true)}>
              <View style={styles.addIcon}>
                <Icon name="add" size={22} color={colors.accent} />
              </View>
              <Text style={type.labelLg}>Add songs from library</Text>
            </Pressable>
          )
        }
        renderItem={({ item, index: i }) => (
          <TrackRow
            track={item}
            playing={queue[index]?.key === item.key}
            onPress={() => (editing ? undefined : playList(tracks, i, { shuffle: false, source }))}
            onMenu={() => setMenuTrack(item)}
            right={
              editing ? (
                <View style={{ flexDirection: 'row' }}>
                  <IconButton name="arrow-upward" disabled={i === 0} onPress={() => moveInPlaylist(id, item.key, -1)} />
                  <IconButton
                    name="arrow-downward"
                    disabled={i === tracks.length - 1}
                    onPress={() => moveInPlaylist(id, item.key, 1)}
                  />
                </View>
              ) : undefined
            }
          />
        )}
      />

      <Sheet visible={menuOpen} title={playlist.name} onClose={() => setMenuOpen(false)}>
        <SheetItem
          icon="edit"
          label="Rename"
          onPress={() => {
            setMenuOpen(false);
            setRenaming(true);
          }}
        />
        <SheetItem
          icon="delete"
          label="Delete playlist"
          destructive
          onPress={() => {
            setMenuOpen(false);
            confirmDelete(playlist);
          }}
        />
      </Sheet>
      <NameDialog
        visible={renaming}
        title="Rename playlist"
        initial={playlist.name}
        onCancel={() => setRenaming(false)}
        onConfirm={(name) => {
          renamePlaylist(id, name);
          setRenaming(false);
        }}
      />
      <AddSongsSheet visible={adding} playlist={playlist} onClose={() => setAdding(false)} />
      <TrackMenu
        track={menuTrack}
        onClose={() => setMenuTrack(null)}
        onAddToPlaylist={(t) => setAddKeys([t.key])}
        onRemoveFromPlaylist={(t) => removeFromPlaylist(id, t.key)}
        onOpenVideo={setVideo}
      />
      <AddToPlaylistSheet keys={addKeys} onClose={() => setAddKeys(null)} />
      <VideoPlayerModal track={video} onClose={() => setVideo(null)} />
    </>
  );
}

/** Pick-list of library items not yet in the playlist. */
function AddSongsSheet({ visible, playlist, onClose }: { visible: boolean; playlist: Playlist; onClose: () => void }) {
  const library = useStore(libraryStore);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const candidates = useMemo(() => {
    const inPlaylist = new Set(playlist.keys);
    const q = query.trim().toLowerCase();
    return library.filter(
      (t) => !inPlaylist.has(t.key) && (!q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
    );
  }, [library, playlist.keys, query]);

  function close() {
    setPicked(new Set());
    setQuery('');
    onClose();
  }

  function toggle(key: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Sheet visible={visible} eyebrow="Add songs" title={playlist.name} onClose={close}>
      <View style={styles.filter}>
        <Icon name="search" size={20} color={colors.muted} />
        <TextInput
          style={styles.filterInput}
          placeholder="Filter your library"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={candidates}
        keyExtractor={(t) => t.key}
        style={{ flexGrow: 0, flexShrink: 1 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={[type.bodyMd, styles.emptyText]}>Everything is already in this playlist.</Text>}
        renderItem={({ item }) => <TrackRow track={item} selected={picked.has(item.key)} onPress={() => toggle(item.key)} />}
      />
      <Button
        label={picked.size ? `Add ${picked.size}` : 'Select songs to add'}
        icon="playlist-add"
        disabled={!picked.size}
        style={{ marginHorizontal: space.md, marginTop: space.sm }}
        onPress={() => {
          // Keep library order (newest first) for the songs being added.
          addToPlaylist(playlist.id, library.filter((t) => picked.has(t.key)).map((t) => t.key));
          close();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  card: { flex: 1, padding: space.sm, borderRadius: radius.lg, backgroundColor: colors.surface },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingTop: space.sm },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  emptyText: { textAlign: 'center', marginTop: space.lg, paddingHorizontal: space.lg },
  addSongs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    margin: space.md,
    padding: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  filterInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
});
