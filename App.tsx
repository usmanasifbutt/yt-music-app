import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import YtDlp from './modules/yt-dlp';
import { downloadsStore, nativeErrorMessage } from './src/downloads';
import { loadLibrary, markUpdated, shouldAutoUpdate } from './src/library';
import { setupPlayer } from './src/player';
import { loadPlaylists, tracksMissing } from './src/playlists';
import { useStore } from './src/store';
import { LibraryScreen } from './src/ui/LibraryScreen';
import { MiniPlayer } from './src/ui/Player';
import { SearchScreen } from './src/ui/SearchScreen';
import { colors } from './src/ui/theme';

type Tab = 'search' | 'library';

export default function App() {
  const [tab, setTab] = useState<Tab>('search');
  const [engine, setEngine] = useState<'loading' | 'updating' | 'ready' | string>('loading');
  const activeDownloads = Object.keys(useStore(downloadsStore)).length;

  useEffect(() => {
    loadPlaylists();
    loadLibrary().then(tracksMissing);
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
        <Text style={styles.heading}>{tab === 'search' ? 'Search' : 'Library'}</Text>
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
        <View style={{ flex: 1 }}>{tab === 'search' ? <SearchScreen /> : <LibraryScreen />}</View>
        <MiniPlayer />
        <View style={styles.tabs}>
          {(['search', 'library'] as const).map((t) => (
            <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
              <Text style={[styles.tabIcon, tab === t && styles.tabActive]}>{t === 'search' ? '⌕' : '♫'}</Text>
              <Text style={[styles.tabLabel, tab === t && styles.tabActive]}>
                {t === 'search' ? 'Search' : 'Library'}
                {t === 'library' && activeDownloads > 0 ? ` (${activeDownloads})` : ''}
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
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
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
