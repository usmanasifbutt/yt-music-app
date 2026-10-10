import { useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { libraryStore, Track } from '../library';
import { playerStore, playList } from '../player';
import {
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
import { NameDialog, Sheet, SheetItem } from './Sheet';
import { colors, common, formatTime } from './theme';
import { TrackMenu } from './TrackMenu';
import { TrackRow } from './TrackRow';
import { VideoPlayerModal } from './VideoPlayer';

export function PlaylistsList({ onOpen }: { onOpen: (id: number) => void }) {
  const playlists = useStore(playlistsStore);
  const library = useStore(libraryStore);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <FlatList
        data={playlists}
        keyExtractor={(p) => String(p.id)}
        ListHeaderComponent={
          <Pressable style={common.row} onPress={() => setCreating(true)}>
            <View style={[common.thumb, styles.newThumb]}>
              <Text style={styles.newPlus}>+</Text>
            </View>
            <Text style={common.title}>New playlist</Text>
          </Pressable>
        }
        ListEmptyComponent={
          <Text style={common.empty}>
            No playlists yet. Create one here, or use ⋮ → Add to playlist on any song. Long-press songs to select
            several.
          </Text>
        }
        renderItem={({ item }) => {
          const tracks = playlistTracks(item, library);
          const pending = item.keys.length - tracks.length;
          const cover = tracks.find((t) => t.thumbnailPath)?.thumbnailPath;
          return (
            <Pressable style={common.row} onPress={() => onOpen(item.id)}>
              {cover ? <Image source={{ uri: cover }} style={common.thumb} /> : <View style={common.thumb} />}
              <View style={{ flex: 1 }}>
                <Text style={common.title} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={common.subtitle}>
                  {tracks.length} {tracks.length === 1 ? 'item' : 'items'}
                  {pending > 0 ? ` · ${pending} downloading` : ''}
                </Text>
              </View>
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
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  const [addKeys, setAddKeys] = useState<string[] | null>(null);
  const [video, setVideo] = useState<Track | null>(null);

  if (!playlist) return null;
  const tracks = playlistTracks(playlist, library);
  const pending = playlist.keys.length - tracks.length;
  const total = tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0);

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
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Pressable style={common.iconButton} onPress={onBack}>
                <Text style={common.iconText}>‹</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {playlist.name}
                </Text>
                <Text style={common.subtitle}>
                  {tracks.length} {tracks.length === 1 ? 'item' : 'items'} · {formatTime(total)}
                  {pending > 0 ? ` · ${pending} downloading` : ''}
                </Text>
              </View>
              <Pressable style={common.iconButton} onPress={() => setMenuOpen(true)}>
                <Text style={[common.iconText, { color: colors.muted }]}>⋮</Text>
              </Pressable>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={[styles.pill, { backgroundColor: colors.accent }]}
                disabled={!tracks.length}
                onPress={() => playList(tracks, 0, { shuffle: false })}>
                <Text style={[styles.pillText, { color: '#fff' }]}>▶ Play</Text>
              </Pressable>
              <Pressable
                style={styles.pill}
                disabled={!tracks.length}
                onPress={() => playList(tracks, 0, { shuffle: true })}>
                <Text style={styles.pillText}>⇄ Shuffle</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              {tracks.length > 1 && (
                <Pressable style={styles.pill} onPress={() => setEditing((e) => !e)}>
                  <Text style={[styles.pillText, editing && { color: colors.accent }]}>
                    {editing ? 'Done' : 'Reorder'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={common.empty}>
            {pending ? 'Songs will appear here as they finish downloading.' : 'Use ⋮ → Add to playlist on any song.'}
          </Text>
        }
        renderItem={({ item, index: i }) => (
          <TrackRow
            track={item}
            playing={queue[index]?.key === item.key}
            onPress={() => (editing ? undefined : playList(tracks, i, { shuffle: false }))}
            onMenu={() => setMenuTrack(item)}
            right={
              editing ? (
                <View style={{ flexDirection: 'row' }}>
                  <Pressable
                    style={common.iconButton}
                    disabled={i === 0}
                    onPress={() => moveInPlaylist(id, item.key, -1)}>
                    <Text style={[common.iconText, i === 0 && { color: colors.border }]}>↑</Text>
                  </Pressable>
                  <Pressable
                    style={common.iconButton}
                    disabled={i === tracks.length - 1}
                    onPress={() => moveInPlaylist(id, item.key, 1)}>
                    <Text style={[common.iconText, i === tracks.length - 1 && { color: colors.border }]}>↓</Text>
                  </Pressable>
                </View>
              ) : undefined
            }
          />
        )}
      />

      <Sheet visible={menuOpen} title={playlist.name} onClose={() => setMenuOpen(false)}>
        <SheetItem
          icon="✎"
          label="Rename"
          onPress={() => {
            setMenuOpen(false);
            setRenaming(true);
          }}
        />
        <SheetItem
          icon="🗑"
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

const styles = StyleSheet.create({
  newThumb: { alignItems: 'center', justifyContent: 'center' },
  newPlus: { color: colors.text, fontSize: 28, fontWeight: '300' },
  header: { paddingBottom: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  pill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
  },
  pillText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
