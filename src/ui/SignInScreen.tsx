import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import YtDlp from '../../modules/yt-dlp';
import { loadAccount } from '../account';
import { IconButton } from './kit';
import { colors, space, type } from './theme';

const SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&uilel=3&passive=true&continue=' +
  encodeURIComponent('https://www.youtube.com/signin?action_handle_signin=true&app=m&hl=en&next=https://m.youtube.com/');

/** Google's sign-in and YouTube only; anything else (ads, other sites) is blocked. */
function isAllowed(url: string) {
  const host = /^https:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  if (!host) return url === 'about:blank';
  return (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    // Google sets the session on its country domain too, e.g. accounts.google.com.pk.
    /^accounts\.google\.(com?\.)?[a-z]{2}$/.test(host)
  );
}

const isYouTubePage = (url: string) => /^https:\/\/(www|m)\.youtube\.com\//i.test(url);

/**
 * Google's own sign-in page. The app never reads what is typed here: once the page reaches
 * YouTube signed in, native code keeps only the youtube.com cookies and wipes this WebView.
 */
export function SignInScreen({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const capturing = useRef(false);
  const done = useRef(false);

  function close() {
    // Leaves nothing behind (e.g. a half-finished Google sign-in) unless the session was saved.
    if (!done.current) void YtDlp.clearSignInWebView();
    done.current = false;
    capturing.current = false;
    onClose();
  }

  async function tryCapture() {
    if (capturing.current || done.current) return;
    capturing.current = true;
    try {
      if (await YtDlp.captureSignIn()) {
        done.current = true;
        await loadAccount();
        ToastAndroid.show('Signed in to YouTube', ToastAndroid.SHORT);
        close();
      }
    } finally {
      capturing.current = false;
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <IconButton name="close" color={colors.text} onPress={close} />
          <View style={{ flex: 1 }}>
            <Text style={type.labelLg}>Sign in to YouTube</Text>
            <Text style={type.bodySm} numberOfLines={1}>
              accounts.google.com · use a spare account
            </Text>
          </View>
          {loading && <ActivityIndicator color={colors.muted} />}
        </View>
        {visible && (
          <WebView
            source={{ uri: SIGN_IN_URL }}
            style={styles.web}
            // Fresh, unsaved session: no cache, no saved passwords or form data.
            incognito
            cacheEnabled={false}
            saveFormDataDisabled
            setSupportMultipleWindows={false}
            mixedContentMode="never"
            allowFileAccess={false}
            onShouldStartLoadWithRequest={(req) => {
              if (isAllowed(req.url)) return true;
              ToastAndroid.show('Blocked a link outside Google sign-in', ToastAndroid.SHORT);
              return false;
            }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={(nav) => {
              if (!nav.loading && isYouTubePage(nav.url)) void tryCapture();
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.sm },
  web: { flex: 1, backgroundColor: colors.bg },
});
