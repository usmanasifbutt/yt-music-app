import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import YtDlp from './modules/yt-dlp';
import { downloadsStore, nativeErrorMessage } from './src/downloads';
import { loadInterests } from './src/interests';
import { loadLibrary, markUpdated, shouldAutoUpdate } from './src/library';
import { setupPlayer } from './src/player';
import { loadPlaylists, syncAllM3u, tracksMissing } from './src/playlists';
import { loadSettings, settingsStore } from './src/settings';
import { useStore } from './src/store';
import { HomeScreen } from './src/ui/HomeScreen';
import { Icon, IconName } from './src/ui/Icon';
import { LegalNotice } from './src/ui/LegalNotice';
import { LibraryScreen } from './src/ui/LibraryScreen';
import { MiniPlayer } from './src/ui/Player';
import { offerRestoreOnFreshInstall } from './src/ui/restoreFlow';
import { SearchScreen } from './src/ui/SearchScreen';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { colors, type } from './src/ui/theme';

type Tab = 'home' | 'search' | 'library' | 'settings';

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'library', label: 'Library', icon: 'library-music' },
  { key: 'settings', label: 'Settings', icon: 'tune' },
];

// Before the first render, so first-launch screens only appear when nothing was saved yet.
loadSettings();
loadInterests();

export type EngineState = 'loading' | 'updating' | 'ready' | { error: string };

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [engine, setEngine] = useState<EngineState>('loading');
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const { consentAccepted } = useStore(settingsStore);
  const activeDownloads = Object.keys(useStore(downloadsStore)).length;

  useEffect(() => {
    loadPlaylists();
    loadLibrary().then((missing) => {
      tracksMissing(missing);
      // Recreate any .m3u files deleted outside the app, and keep the library index current.
      syncAllM3u();
      setLibraryLoaded(true);
    });
    setupPlayer();
    // First launch unpacks python + ffmpeg; do it up front so the first search is fast.
    // The yt-dlp bundled in the APK goes stale as YouTube changes, so refresh it daily.
    YtDlp.init()
      .then(async () => {
        if (settingsStore.get().autoUpdate && shouldAutoUpdate()) {
          setEngine('updating');
          try {
            await YtDlp.update();
            markUpdated();
          } catch {
            // No internet or GitHub unreachable: keep using the current engine.
          }
        }
        setEngine('ready');
      })
      .catch((e) => setEngine({ error: nativeErrorMessage(e) }));
  }, []);

  // After the notice is accepted, a fresh install offers to restore from the music folders.
  useEffect(() => {
    if (consentAccepted && libraryLoaded) offerRestoreOnFreshInstall();
  }, [consentAccepted, libraryLoaded]);

  if (!consentAccepted) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <LegalNotice />
      </SafeAreaProvider>
    );
  }

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={type.headlineLg}>{current.label}</Text>
        </View>
        {engine !== 'ready' && tab !== 'settings' && (
          <View style={styles.banner}>
            {typeof engine === 'object' ? (
              <Text style={[type.bodySm, { color: colors.accent }]}>{engine.error}</Text>
            ) : (
              <>
                <ActivityIndicator color={colors.muted} size="small" />
                <Text style={type.bodySm}>
                  {engine === 'loading' ? 'Preparing download engine…' : 'Updating download engine…'}
                </Text>
              </>
            )}
          </View>
        )}
        <View style={{ flex: 1 }}>
          {tab === 'home' ? (
            <HomeScreen />
          ) : tab === 'search' ? (
            <SearchScreen />
          ) : tab === 'library' ? (
            <LibraryScreen onGoSearch={() => setTab('search')} />
          ) : (
            <SettingsScreen engine={engine} />
          )}
        </View>
        <MiniPlayer />
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.key;
            const color = active ? colors.accent : colors.muted;
            return (
              <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
                <View>
                  <Icon name={t.icon} size={24} color={color} />
                  {t.key === 'library' && activeDownloads > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={[type.labelSm, { color: colors.bg }]}>{activeDownloads}</Text>
                    </View>
                  )}
                </View>
                <Text style={[type.labelMd, { color }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  banner: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 },
  tabs: {
    flexDirection: 'row',
    height: 64,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabBadge: {
    position: 'absolute',
    right: -10,
    top: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
