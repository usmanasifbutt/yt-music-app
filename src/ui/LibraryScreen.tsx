import { useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import YtDlp from '../../modules/yt-dlp';
import { cancelDownload, downloadsStore, nativeErrorMessage, retryDownload } from '../downloads';
import { libraryStore, removeTrack, Track } from '../library';
import { forgetTrack, playerStore, playList } from '../player';
import { useStore } from '../store';
import { colors, common, formatTime } from './theme';
import { VideoPlayerModal } from './VideoPlayer';

export function LibraryScreen() {
  const tracks = useStore(libraryStore);
  const audioTracks = tracks.filter((t) => t.kind === 'audio');
  const downloads = Object.values(useStore(downloadsStore));
  const { queue, index } = useStore(playerStore);
  const playingKey = queue[index]?.key;
  const [updating, setUpdating] = useState(false);
  const [video, setVideo] = useState<Track | null>(null);

  function open(track: Track) {
    if (track.kind === 'video') setVideo(track);
    else playList(audioTracks, audioTracks.indexOf(track));
  }

  function confirmDelete(track: Track) {
    Alert.alert('Delete from device?', track.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          forgetTrack(track.key);
          const deleted = await removeTrack(track.key);
          if (!deleted) {
            Alert.alert(
              'Removed from library',
              'Android did not let the app delete the file itself. You can delete it from the Files app in Music/YT Music Offline or Movies/YT Music Offline.'
            );
          }
        },
      },
    ]);
  }

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
    <>
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.key}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={styles.count}>
                {audioTracks.length} audio · {tracks.length - audioTracks.length} video
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={styles.pill} onPress={updateEngine} disabled={updating}>
                  <Text style={styles.pillText}>{updating ? 'Updating…' : 'Update engine'}</Text>
                </Pressable>
                {audioTracks.length > 0 && (
                  <Pressable
                    style={[styles.pill, { backgroundColor: colors.accent }]}
                    onPress={() => playList(audioTracks, 0)}>
                    <Text style={[styles.pillText, { color: '#fff' }]}>▶ Play all</Text>
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
                  <Text
                    style={[common.subtitle, d.status === 'error' && { color: colors.accent }]}
                    numberOfLines={2}>
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
        }
        ListEmptyComponent={
          downloads.length ? null : (
            <Text style={common.empty}>Nothing saved yet. Find something in Search and tap ⬇.</Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable style={common.row} onPress={() => open(item)} onLongPress={() => confirmDelete(item)}>
            <View>
              {item.thumbnailPath ? (
                <Image source={{ uri: item.thumbnailPath }} style={common.thumb} />
              ) : (
                <View style={common.thumb} />
              )}
              {item.kind === 'video' && (
                <View style={styles.videoBadge}>
                  <Text style={styles.videoBadgeText}>{item.height}p</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[common.title, item.key === playingKey && { color: colors.accent }]}
                numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={common.subtitle} numberOfLines={1}>
                {item.kind === 'video' ? '▶ Video · ' : ''}
                {item.artist} · {formatTime(item.duration)}
              </Text>
            </View>
          </Pressable>
        )}
      />
      <VideoPlayerModal track={video} onClose={() => setVideo(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  count: { color: colors.muted, fontSize: 14 },
  pill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  pillText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  barTrack: {
    height: 3,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: { height: 3, backgroundColor: colors.accent },
  hint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  videoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 3,
    paddingHorizontal: 3,
  },
  videoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
