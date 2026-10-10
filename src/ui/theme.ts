import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#0f0f12',
  surface: '#1b1b21',
  surfaceHigh: '#26262e',
  text: '#f2f2f5',
  muted: '#9a9aa6',
  accent: '#ff4e45',
  success: '#3ecf8e',
  border: '#2c2c35',
};

export function formatTime(seconds: number | null | undefined) {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export const common = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  thumb: { width: 56, height: 56, borderRadius: 6, backgroundColor: colors.surfaceHigh },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  iconButton: { padding: 10, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.text, fontSize: 20 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 },
});
