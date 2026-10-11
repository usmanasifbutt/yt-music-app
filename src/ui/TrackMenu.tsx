import { Alert } from 'react-native';
import { Track } from '../library';
import { forgetTrack, addToQueue, playNext } from '../player';
import { deleteTrackEverywhere } from '../playlists';
import { Sheet, SheetItem } from './Sheet';

export function confirmDeleteTracks(tracks: Track[], onDone?: () => void) {
  const title = tracks.length === 1 ? 'Delete from device?' : `Delete ${tracks.length} items from device?`;
  Alert.alert(title, tracks.length === 1 ? tracks[0].title : 'They will also be removed from all playlists.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        let refused = 0;
        for (const t of tracks) {
          forgetTrack(t.key);
          if (!(await deleteTrackEverywhere(t.key))) refused++;
        }
        onDone?.();
        if (refused) {
          Alert.alert(
            'Removed from library',
            `Android did not let the app delete ${refused === 1 ? 'one file' : `${refused} files`}. ` +
              'You can delete them from the Files app in Music/YT Music or Movies/YT Music.'
          );
        }
      },
    },
  ]);
}

/** ⋮ menu for a library track. `onRemoveFromPlaylist` adds a playlist-specific action. */
export function TrackMenu({
  track,
  onClose,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onOpenVideo,
}: {
  track: Track | null;
  onClose: () => void;
  onAddToPlaylist: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  /** Adds "Watch video" for video tracks (playlists play videos as audio). */
  onOpenVideo?: (track: Track) => void;
}) {
  if (!track) return null;
  const done = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Sheet visible title={track.title} subtitle={track.artist} onClose={onClose}>
      {track.kind === 'video' && onOpenVideo && (
        <SheetItem icon="smart-display" label="Watch video" onPress={done(() => onOpenVideo(track))} />
      )}
      <SheetItem icon="playlist-play" label="Play next" onPress={done(() => playNext(track))} />
      <SheetItem icon="queue" label="Add to queue" onPress={done(() => addToQueue(track))} />
      <SheetItem icon="playlist-add" label="Add to playlist…" onPress={done(() => onAddToPlaylist(track))} />
      {onRemoveFromPlaylist && (
        <SheetItem icon="playlist-remove" label="Remove from this playlist" onPress={done(() => onRemoveFromPlaylist(track))} />
      )}
      <SheetItem icon="delete" label="Delete from device" destructive onPress={done(() => confirmDeleteTracks([track]))} />
    </Sheet>
  );
}
