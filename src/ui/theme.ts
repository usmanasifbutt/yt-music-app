import { StyleSheet } from 'react-native';

// "Obsidian Audio" design system: one palette for the whole app. Use these tokens,
// never raw hex values, in components.
export const colors = {
  bg: '#0f0f12', // canvas: screens, sheets' backdrop
  surface: '#1b1b21', // level 1: tab bar, mini player, inputs, list backdrops
  surfaceHigh: '#26262e', // level 2: cards, chips, dialogs, placeholders
  border: '#2c2c35', // hairlines, inactive outlines, progress tracks
  text: '#f2f2f5',
  muted: '#9a9aa6', // secondary text, inactive icons
  faint: '#6c6c7a', // tertiary text, trailing ⋮, disabled
  accent: '#ff4e45', // primary actions, progress, active states, now playing
  accentSoft: 'rgba(255,78,69,0.15)',
  success: '#3ecf8e', // downloaded / offline / storage only
  successSoft: 'rgba(62,207,142,0.12)',
  scrim: 'rgba(0,0,0,0.6)', // behind sheets and dialogs
  overlay: 'rgba(15,15,18,0.85)', // labels drawn on artwork (durations)
  overlaySoft: 'rgba(15,15,18,0.6)', // "now playing" tint on artwork
  videoLetterbox: '#000000',
  onAccent: '#ffffff',
};

/** Coral glows for the play button, seek thumb and artwork (design system "ambient" shadows). */
export const glow = {
  fab: '0px 4px 16px rgba(255, 78, 69, 0.35)',
  thumb: '0px 2px 8px rgba(255, 78, 69, 0.5)',
  artwork: '0px 12px 32px rgba(255, 78, 69, 0.18)',
};

export const radius = { sm: 4, md: 8, lg: 16, pill: 999 };

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// Type scale (system font; sizes/weights from the design system).
export const type = StyleSheet.create({
  headlineLg: { color: colors.text, fontSize: 28, fontWeight: '700', lineHeight: 34 },
  headlineMd: { color: colors.text, fontSize: 22, fontWeight: '600', lineHeight: 28 },
  headlineSm: { color: colors.text, fontSize: 18, fontWeight: '600', lineHeight: 24 },
  bodyLg: { color: colors.text, fontSize: 16, fontWeight: '500', lineHeight: 22 },
  bodyMd: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  bodySm: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  labelLg: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 18 },
  labelMd: { color: colors.text, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  labelSm: { color: colors.text, fontSize: 10, fontWeight: '700', lineHeight: 14, letterSpacing: 0.5 },
});

export function formatTime(seconds: number | null | undefined) {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Bottom padding for scrollers so the last item clears the mini player. */
export const LIST_BOTTOM = 96;

export const common = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    minHeight: 64,
    paddingVertical: space.sm,
    gap: 12,
  },
  thumb: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surfaceHigh },
  title: { color: colors.text, fontSize: 16, fontWeight: '500' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.text, fontSize: 20 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 48, paddingHorizontal: 32, lineHeight: 20 },
});
