import { useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUDIO_DIR, VIDEO_DIR } from '../appInfo';
import { updateSettings } from '../settings';
import { Icon, IconName } from './Icon';
import { Button, Card } from './kit';
import { colors, radius, space, type } from './theme';

export const NOTICE_POINTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'person',
    title: 'Personal use only',
    text: "Downloading from YouTube is against YouTube's Terms of Service and, for copyrighted music, may infringe copyright where you live. Only keep content you have the right to.",
  },
  {
    icon: 'phonelink-lock',
    title: 'Everything stays on your phone',
    text: 'Search and downloads run on this device with the open-source yt-dlp engine. No account, no tracking, nothing sent anywhere else.',
  },
  {
    icon: 'folder',
    title: 'Where files go',
    text: `Audio is saved to ${AUDIO_DIR} and video to ${VIDEO_DIR}, so other players can use them too.`,
  },
];

/** One-time notice before first use. Also readable from Settings → About. */
export function LegalNotice() {
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.md }]}>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: space.md }}>
        <View style={styles.hero}>
          <Icon name="gavel" size={32} color={colors.accent} />
        </View>
        <Text style={[type.headlineLg, { textAlign: 'center' }]}>Before you start</Text>
        <Text style={[type.bodyMd, { textAlign: 'center', marginBottom: space.sm }]}>
          A quick note on how YT Music works.
        </Text>
        <NoticeCards />
        <Pressable style={styles.agree} onPress={() => setAgreed((a) => !a)}>
          <View style={[styles.box, agreed && styles.boxOn]}>{agreed && <Icon name="check" size={16} color={colors.onAccent} />}</View>
          <Text style={[type.bodyMd, { color: colors.text, flex: 1 }]}>
            I'll only use this for personal listening of content I have the right to keep.
          </Text>
        </Pressable>
      </ScrollView>
      <Button label="Continue" icon="arrow-forward" disabled={!agreed} onPress={() => updateSettings({ consentAccepted: true })} />
      <Button label="Decline and exit" variant="ghost" onPress={() => BackHandler.exitApp()} />
    </View>
  );
}

export function NoticeCards() {
  return (
    <>
      {NOTICE_POINTS.map((p) => (
        <Card key={p.title} style={styles.point}>
          <View style={styles.pointIcon}>
            <Icon name={p.icon} size={22} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.labelLg}>{p.title}</Text>
            <Text style={[type.bodySm, { marginTop: 4, lineHeight: 18 }]}>{p.text}</Text>
          </View>
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.md, gap: space.sm },
  hero: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  point: { flexDirection: 'row', gap: 12 },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: space.sm, paddingHorizontal: 4 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
