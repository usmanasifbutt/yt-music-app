import { Alert, ToastAndroid } from 'react-native';
import { nativeErrorMessage } from '../downloads';
import { getSetting, libraryStore, setSetting } from '../library';
import { playlistsStore } from '../playlists';
import { requestReadPermission, restoreFromDevice } from '../restore';

/** Asks for permission, restores, and reports what happened. */
export async function runRestore() {
  if (!(await requestReadPermission())) {
    Alert.alert(
      'Permission needed',
      'To find songs from an earlier install, allow "Music and audio" for YT Music in Android Settings → Apps → YT Music → Permissions.'
    );
    return;
  }
  try {
    ToastAndroid.show('Looking in Music/YT Music and Movies/YT Music…', ToastAndroid.SHORT);
    const { tracks, playlists, writeAccess } = await restoreFromDevice();
    if (!tracks && !playlists) {
      Alert.alert('Nothing to restore', 'Everything in Music/YT Music and Movies/YT Music is already in your library.');
      return;
    }
    Alert.alert(
      'Restored',
      `Added ${tracks} ${tracks === 1 ? 'item' : 'items'} and ${playlists} ${playlists === 1 ? 'playlist' : 'playlists'}.` +
        (writeAccess
          ? ''
          : '\n\nWithout permission to modify the old files, the app will save new copies of the playlist files, and deleting old songs from the app may not work.')
    );
  } catch (e) {
    Alert.alert('Restore failed', nativeErrorMessage(e));
  }
}

/** On a fresh install (empty library), offer once to restore from the music folders. */
export function offerRestoreOnFreshInstall() {
  if (getSetting('restoreOffered', false)) return;
  if (libraryStore.get().length || playlistsStore.get().length) {
    setSetting('restoreOffered', true); // existing user; nothing to restore
    return;
  }
  setSetting('restoreOffered', true);
  Alert.alert(
    'Restore your music?',
    'If you used YT Music before on this phone, it can bring back your downloads and playlists from Music/YT Music and Movies/YT Music.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Restore', onPress: () => void runRestore() },
    ]
  );
}
