import YtDlp from '../modules/yt-dlp';
import { createStore } from './store';

/** Whether downloads use a signed-in YouTube session (see YouTubeAccount.kt). */
export const accountStore = createStore<{ signedIn: boolean }>({ signedIn: false });

export async function loadAccount() {
  accountStore.set({ signedIn: await YtDlp.isSignedIn() });
}

export async function signOutOfYouTube() {
  await YtDlp.signOut();
  accountStore.set({ signedIn: false });
}
