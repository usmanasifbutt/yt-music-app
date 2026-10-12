import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import YtDlp from '../../modules/yt-dlp';
import type { EngineState } from '../../App';
import { accountStore, loadAccount, signOutOfYouTube } from '../account';
import { AUDIO_DIR, VERSION_LABEL, VIDEO_DIR } from '../appInfo';
import { nativeErrorMessage } from '../downloads';
import { INTERESTS, interestsStore } from '../interests';
import { libraryStore, markUpdated } from '../library';
import { formatBytes, STALE_DAYS, staleTracks, totalSize } from '../libraryView';
import { playerStore, setRate, SPEEDS } from '../player';
import { playlistsStore } from '../playlists';
import { DefaultFormat, settingsStore, updateSettings } from '../settings';
import { useStore, useStoreValue } from '../store';
import { Icon, IconName } from './Icon';
import { InterestPicker } from './InterestPicker';
import { Badge, Button, Card, Segmented, SettingRow, StackedBar, Stepper, Toggle } from './kit';
import { NoticeCards } from './LegalNotice';
import { runRestore } from './restoreFlow';
import { SignInScreen } from './SignInScreen';
import { Sheet, SheetItem } from './Sheet';
import { colors, LIST_BOTTOM, radius, space, type } from './theme';
import { confirmDeleteTracks } from './TrackMenu';

const RELEASES_URL = 'https://github.com/usmanasifbutt/yt-music-app/releases';

export function SettingsScreen({ engine }: { engine: EngineState }) {
  const settings = useStore(settingsStore);
  const rate = useStoreValue(playerStore, (s) => s.rate);
  const library = useStore(libraryStore);
  const playlists = useStore(playlistsStore);
  const interests = useStore(interestsStore);
  const [version, setVersion] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [sheet, setSheet] = useState<'speed' | 'notice' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const { signedIn } = useStore(accountStore);

  useEffect(() => {
    if (engine === 'ready') YtDlp.version().then(setVersion).catch(() => {});
  }, [engine]);

  async function updateEngine() {
    setUpdating(true);
    try {
      const status = await YtDlp.update();
      markUpdated();
      const v = await YtDlp.version();
      setVersion(v);
      Alert.alert('Download engine', status === 'ALREADY_UP_TO_DATE' ? `Already up to date (${v})` : `Updated to ${v}`);
    } catch (e) {
      Alert.alert('Update failed', nativeErrorMessage(e));
    } finally {
      setUpdating(false);
    }
  }

  async function importCookiesFile() {
    try {
      if (!(await YtDlp.importCookies())) return;
      await loadAccount();
      Alert.alert('Signed in to YouTube', 'The file you picked still holds the sign-in in plain text. Delete it from your phone now?', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (await YtDlp.deleteImportedCookiesFile()) ToastAndroid.show('Cookies file deleted', ToastAndroid.SHORT);
            else Alert.alert("Couldn't delete it", 'Please delete the cookies file yourself in the Files app.');
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Import failed', nativeErrorMessage(e));
    }
  }

  function confirmSignOut() {
    Alert.alert(
      'Sign out of YouTube?',
      'Removes the YouTube session from this phone. To end it on Google too, remove this device under Google Account → Security → Your devices.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOutOfYouTube() },
      ]
    );
  }

  const audio = library.filter((t) => t.kind === 'audio');
  const videos = library.filter((t) => t.kind === 'video');
  const stale = staleTracks(library);
  const engineLabel = typeof engine === 'object' ? 'Error' : engine === 'ready' ? 'Active' : 'Starting';
  const interestNames = (interests ?? []).map((id) => INTERESTS.find((i) => i.id === id)?.label).filter(Boolean);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Group icon="terminal" title="Download engine" subtitle={version ? `yt-dlp ${version}` : 'yt-dlp'} badge={engineLabel}>
          {typeof engine === 'object' && <Text style={[type.bodySm, { color: colors.accent }]}>{engine.error}</Text>}
          <SettingRow
            title="Update now"
            subtitle="Fixes downloads when YouTube changes something"
            right={<Button label={updating ? 'Updating' : 'Update'} icon="sync" variant="secondary" loading={updating} onPress={updateEngine} />}
          />
          <SettingRow
            title="Auto-update daily"
            subtitle="Checks for a new engine when the app opens"
            right={<Toggle value={settings.autoUpdate} onChange={(v) => updateSettings({ autoUpdate: v })} />}
          />
        </Group>

        <Group icon="file-download" title="Downloads" subtitle="Format and speed">
          <SettingRow
            title="Download button saves"
            subtitle="Video is 720p. Long-press the button for other qualities."
            right={
              <View style={{ width: 150 }}>
                <Segmented<DefaultFormat>
                  value={settings.defaultFormat}
                  onChange={(v) => updateSettings({ defaultFormat: v })}
                  options={[
                    { value: 'audio', label: 'Audio' },
                    { value: 'video', label: 'Video' },
                  ]}
                />
              </View>
            }
          />
          <SettingRow
            title="Simultaneous downloads"
            subtitle="More is faster on good connections"
            right={<Stepper value={settings.maxParallel} min={1} max={3} onChange={(v) => updateSettings({ maxParallel: v })} />}
          />
        </Group>

        <Group
          icon="account-circle"
          title="YouTube account"
          subtitle={`Stops "confirm you're not a bot" errors`}
          badge={signedIn ? 'Signed in' : 'Signed out'}
          badgeTone={signedIn ? 'success' : undefined}>
          {signedIn ? (
            <SettingRow
              title="Downloads use your YouTube sign-in"
              subtitle="Kept only on this phone, never backed up"
              right={<Button label="Sign out" variant="secondary" onPress={confirmSignOut} />}
            />
          ) : (
            <>
              <SettingRow title="Sign in" subtitle="On Google's own page. Use a spare account, not your main one." onPress={() => setSigningIn(true)} />
              <SettingRow
                title="Import cookies file"
                subtitle="If Google blocks the sign-in here: export cookies.txt from youtube.com on a computer"
                onPress={() => void importCookiesFile()}
              />
            </>
          )}
        </Group>

        <Group icon="graphic-eq" title="Playback">
          <SettingRow title="Playback speed" subtitle="Pitch stays natural" onPress={() => setSheet('speed')} right={<Badge label={`${rate}×`} />} />
          <SettingRow
            title="Music interests"
            subtitle={interestNames.length ? interestNames.join(', ') : 'Not set'}
            onPress={() => setPickerOpen(true)}
          />
        </Group>

        <Group icon="storage" title="Storage" subtitle={`${AUDIO_DIR} and ${VIDEO_DIR}`} badge={formatBytes(totalSize(library))} badgeTone="success">
          <View style={styles.stats}>
            <Stat label="Songs" value={audio.length} />
            <Stat label="Videos" value={videos.length} />
            <Stat label="Playlists" value={playlists.length} />
          </View>
          <StackedBar
            parts={[
              { value: totalSize(audio), color: colors.accent },
              { value: totalSize(videos), color: colors.success },
            ]}
          />
          <View style={styles.legend}>
            <Legend color={colors.accent} label={`Audio ${formatBytes(totalSize(audio))}`} />
            <Legend color={colors.success} label={`Video ${formatBytes(totalSize(videos))}`} />
          </View>
          <View style={styles.buttons}>
            <Button
              label={stale.length ? `Clean up ${formatBytes(totalSize(stale))}` : 'Nothing to clean'}
              icon="delete-sweep"
              variant="secondary"
              disabled={!stale.length}
              onPress={() => confirmDeleteTracks(stale)}
              style={{ flex: 1 }}
            />
            <Button label="Restore" icon="restore" variant="secondary" onPress={() => void runRestore()} style={{ flex: 1 }} />
          </View>
          <Text style={type.bodySm}>
            Clean up deletes items not played for {STALE_DAYS}+ days. Restore re-adds downloads and playlists found in the
            folders, e.g. after reinstalling, and removes duplicate playlist files.
          </Text>
        </Group>

        <Group icon="info" title="About YT Music" badge={VERSION_LABEL}>
          <SettingRow title="What's new" subtitle="Release notes on GitHub" onPress={() => Linking.openURL(RELEASES_URL)} />
          <SettingRow title="Legal notice" subtitle="Personal use, privacy, file locations" onPress={() => setSheet('notice')} />
        </Group>
      </ScrollView>

      <SignInScreen visible={signingIn} onClose={() => setSigningIn(false)} />

      <Sheet visible={sheet === 'speed'} title="Playback speed" onClose={() => setSheet(null)}>
        {SPEEDS.map((s) => (
          <SheetItem
            key={s}
            icon={s === rate ? 'check' : 'blank'}
            label={s === 1 ? 'Normal' : `${s}×`}
            onPress={() => {
              setRate(s);
              setSheet(null);
            }}
          />
        ))}
      </Sheet>
      <Sheet visible={sheet === 'notice'} title="Legal notice" onClose={() => setSheet(null)}>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12, padding: space.md }}>
          <NoticeCards />
        </ScrollView>
      </Sheet>
      <InterestPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </>
  );
}

function Group({
  icon,
  title,
  subtitle,
  badge,
  badgeTone = 'neutral',
  children,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'neutral' | 'success';
  children: React.ReactNode;
}) {
  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.groupHeader}>
        <View style={styles.groupIcon}>
          <Icon name={icon} size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.headlineSm}>{title}</Text>
          {subtitle ? <Text style={type.bodySm}>{subtitle}</Text> : null}
        </View>
        {badge ? <Badge label={badge} tone={badgeTone === 'success' || badge === 'Active' ? 'success' : 'neutral'} /> : null}
      </View>
      {children}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.labelSm, { color: colors.muted }]}>{label.toUpperCase()}</Text>
      <Text style={type.headlineSm}>{value}</Text>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={type.bodySm}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, gap: space.md, paddingBottom: LIST_BOTTOM },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row' },
  legend: { flexDirection: 'row', gap: space.md },
  buttons: { flexDirection: 'row', gap: space.sm },
});
