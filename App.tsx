import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import YtDlp from './modules/yt-dlp';
import { downloadsStore, nativeErrorMessage } from './src/downloads';
import { loadLibrary, markUpdated, shouldAutoUpdate } from './src/library';
import { setupPlayer } from './src/player';
import { loadPlaylists, syncAllM3u, tracksMissing } from './src/playlists';
import { offerRestoreOnFreshInstall } from './src/ui/restoreFlow';
import { useStore } from './src/store';
import { LibraryScreen } from './src/ui/LibraryScreen';
import { MiniPlayer } from './src/ui/Player';
import { SearchScreen } from './src/ui/SearchScreen';
import { loadInterests } from './src/interests';
import { HomeScreen } from './src/ui/HomeScreen';
import { Icon, IconName } from './src/ui/Icon';
import { colors } from './src/ui/theme';

type Tab = 'home' | 'search' | 'library';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'library', label: 'Library', icon: 'library-music' },
];

// Before the first render, so the interest picker only appears when nothing was saved yet.
loadInterests();

// e.g. "v1.3.0 (5)" or "v1.3.0-dev.ea3c35e (6) Beta", read from the installed APK. The build
// number is assigned by EAS at build time, so it isn't in app.json.
const APP_VERSION = [
  `v${Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '?'}`,
  `(${Application.nativeBuildVersion ?? '?'})`,
  Constants.expoConfig?.name?.endsWith('Beta') ? 'Beta' : '',
]
  .filter(Boolean)
  .join(' ');

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [engine, setEngine] = useState<'loading' | 'updating' | 'ready' | string>('loading');
  const activeDownloads = Object.keys(useStore(downloadsStore)).length;

  useEffect(() => {
    loadPlaylists();
    loadLibrary().then((missing) => {
      tracksMissing(missing);
      // Recreate any .m3u files deleted outside the app, and keep the library index current.
      syncAllM3u();
      offerRestoreOnFreshInstall();
    });
    setupPlayer();
    // First launch unpacks python + ffmpeg; do it up front so the first search is fast.
    // The yt-dlp bundled in the APK goes stale as YouTube changes, so refresh it daily.
    YtDlp.init()
      .then(async () => {
        if (shouldAutoUpdate()) {
          setEngine('updating');
          try {
            await YtDlp.update();
            markUpdated();
          } catch {
            // Offline or GitHub unreachable: keep using the current engine.
          }
        }
        setEngine('ready');
      })
      .catch((e) => setEngine(nativeErrorMessage(e)));
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.headingRow}>
          <Text style={styles.heading}>{TABS.find((t) => t.key === tab)!.label}</Text>
          <Text style={styles.version}>{APP_VERSION}</Text>
        </View>
        {engine !== 'ready' && (
          <View style={styles.banner}>
            {engine === 'loading' || engine === 'updating' ? (
              <>
                <ActivityIndicator color={colors.muted} size="small" />
                <Text style={styles.bannerText}>
                  {engine === 'loading' ? 'Preparing download engine…' : 'Updating download engine…'}
                </Text>
              </>
            ) : (
              <Text style={[styles.bannerText, { color: colors.accent }]}>{engine}</Text>
            )}
          </View>
        )}
        <View style={{ flex: 1 }}>
          {tab === 'home' ? <HomeScreen /> : tab === 'search' ? <SearchScreen /> : <LibraryScreen />}
        </View>
        <MiniPlayer />
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Icon name={t.icon} size={24} color={tab === t.key ? colors.text : colors.muted} />
              <Text style={[styles.tabLabel, tab === t.key && styles.tabActive]}>
                {t.label}
                {t.key === 'library' && activeDownloads > 0 ? ` (${activeDownloads})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  heading: { color: colors.text, fontSize: 28, fontWeight: '800' },
  version: { color: colors.muted, fontSize: 12 },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  bannerText: { color: colors.muted, fontSize: 13 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { color: colors.muted, fontSize: 20 },
  tabLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  tabActive: { color: colors.text },
});
