import { Alert } from 'react-native';
import { addToPlaylist, createPlaylist, freeName, playlistNamed } from '../playlists';

/**
 * Creates a playlist called `name` holding `keys`. If a playlist already has that name, asks
 * whether to use it (adding the songs) or create one under a free name such as "Gym 2".
 * `onDone` gets the playlist that was used; `message` replaces the question's default text.
 */
export function createOrMerge(
  name: string,
  keys: string[],
  onDone: (playlist: { id: number; name: string; merged: boolean }) => void,
  message?: string
) {
  const existing = playlistNamed(name);
  if (!existing) {
    onDone({ id: createPlaylist(name, keys), name: name.trim(), merged: false });
    return;
  }
  const alternative = freeName(name);
  Alert.alert(
    `"${existing.name}" already exists`,
    message ??
      (keys.length
        ? `Add to "${existing.name}", or create a new playlist "${alternative}"?`
        : `Open "${existing.name}", or create a new playlist "${alternative}"?`),
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `New "${alternative}"`,
        onPress: () => onDone({ id: createPlaylist(alternative, keys), name: alternative, merged: false }),
      },
      {
        text: keys.length ? 'Add to it' : 'Open it',
        onPress: () => {
          addToPlaylist(existing.id, keys);
          onDone({ id: existing.id, name: existing.name, merged: true });
        },
      },
    ]
  );
}

/** For renames: true (after telling the user) if another playlist already has `name`. */
export function nameTaken(name: string, id: number) {
  const other = playlistNamed(name, id);
  if (other) Alert.alert('Name already used', `There's already a playlist called "${other.name}". Choose another name.`);
  return !!other;
}
