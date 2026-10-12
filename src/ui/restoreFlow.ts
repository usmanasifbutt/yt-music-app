import { Alert, ToastAndroid } from 'react-native';
import { AUDIO_DIR, VIDEO_DIR } from '../appInfo';
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
    ToastAndroid.show(`Looking in ${AUDIO_DIR} and ${VIDEO_DIR}…`, ToastAndroid.SHORT);
    const { tracks, playlists, writeAccess, cleaned } = await restoreFromDevice();
    const tidied = cleaned ? `Removed ${cleaned} duplicate playlist ${cleaned === 1 ? 'file' : 'files'}.` : '';
    if (!tracks && !playlists) {
      if (tidied) {
        Alert.alert('Tidied up', `${tidied} Your library was already complete.`);
        return;
      }
      Alert.alert('Nothing to restore', `Everything in ${AUDIO_DIR} and ${VIDEO_DIR} is already in your library.`);
      return;
    }
    Alert.alert(
      'Restored',
      `Added ${tracks} ${tracks === 1 ? 'item' : 'items'} and ${playlists} ${playlists === 1 ? 'playlist' : 'playlists'}.` +
        (tidied ? ` ${tidied}` : '') +
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
    `If you used YT Music before on this phone, it can bring back your downloads and playlists from ${AUDIO_DIR} and ${VIDEO_DIR}.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Restore', onPress: () => void runRestore() },
    ]
  );
}
