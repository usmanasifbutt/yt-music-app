// Shared building blocks for every screen. Keep screens composed from these so the look
// stays consistent and the bundle stays small.
import { Image } from 'expo-image';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Icon, IconName } from './Icon';
import { colors, radius, space, type } from './theme';

// ── Buttons ──────────────────────────────────────────────────────────────────

export function Button({
  label,
  icon,
  variant = 'primary',
  onPress,
  disabled,
  loading,
  style,
}: {
  label: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost';
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = variant === 'primary' ? colors.onAccent : variant === 'ghost' ? colors.muted : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        (disabled || loading) && { opacity: 0.4 },
        pressed && { opacity: 0.75 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <Text style={[type.labelLg, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  color = colors.text,
  size = 24,
  filled,
  disabled,
  accessibilityLabel,
}: {
  name: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  /** Round surface behind the icon. */
  filled?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.iconButton, filled && styles.iconButtonFilled, pressed && { opacity: 0.6 }]}>
      <Icon name={name} size={size} color={disabled ? colors.border : color} />
    </Pressable>
  );
}

// ── Chips & segments ─────────────────────────────────────────────────────────

export function Chip({
  label,
  icon,
  active,
  count,
  onPress,
}: {
  label: string;
  icon?: IconName;
  active?: boolean;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {icon ? <Icon name={icon} size={16} color={active ? colors.onAccent : colors.muted} /> : null}
      <Text style={[type.labelLg, { color: active ? colors.onAccent : colors.muted }]}>{label}</Text>
      {count ? (
        <View style={[styles.count, active && { backgroundColor: colors.onAccent }]}>
          <Text style={[type.labelSm, { color: active ? colors.accent : colors.bg }]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Horizontally scrolling row of chips (filters, segments). */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      horizontal
      // ScrollView grows by default; without this a chip row eats half the screen's height.
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.chipRow, style]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

// ── Labels ───────────────────────────────────────────────────────────────────

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'accent' }) {
  const bg = tone === 'success' ? colors.successSoft : tone === 'accent' ? colors.accentSoft : colors.surfaceHigh;
  const fg = tone === 'success' ? colors.success : tone === 'accent' ? colors.accent : colors.muted;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[type.labelSm, { color: fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** Small green check shown on artwork for items saved on the device. */
export function SavedDot({ icon = 'check' }: { icon?: IconName }) {
  return (
    <View style={styles.savedDot}>
      <Icon name={icon} size={12} color={colors.bg} />
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  loading,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  loading?: boolean;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[type.headlineSm, { flexShrink: 1 }]} numberOfLines={1}>
        {title}
      </Text>
      {loading ? <ActivityIndicator size="small" color={colors.muted} /> : null}
      <View style={{ flex: 1 }} />
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={[type.labelLg, { color: colors.muted }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Containers ───────────────────────────────────────────────────────────────

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: IconName;
  title: string;
  text: string;
  /** Buttons. */
  children?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={36} color={colors.accent} />
      </View>
      <Text style={[type.headlineMd, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.bodyMd, { textAlign: 'center', marginTop: space.sm }]}>{text}</Text>
      {children ? <View style={styles.emptyActions}>{children}</View> : null}
    </View>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────

export function ProgressBar({ value, color = colors.accent }: { value: number; color?: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }]} />
    </View>
  );
}

/** Stacked bar, e.g. storage used by audio (accent) and video (success). */
export function StackedBar({ parts }: { parts: { value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <View style={[styles.track, { flexDirection: 'row', height: 6 }]}>
      {parts.map((p, i) => (
        <View key={i} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />
      ))}
    </View>
  );
}

// ── Settings rows ────────────────────────────────────────────────────────────

export function SettingRow({
  title,
  subtitle,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.settingRow, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyLg}>{title}</Text>
        {subtitle ? <Text style={[type.bodySm, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" size={22} color={colors.faint} /> : null)}
    </Pressable>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.border, true: colors.accent }}
      thumbColor={colors.text}
    />
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <IconButton name="remove" size={20} disabled={value <= min} onPress={() => onChange(value - 1)} />
      <Text style={[type.headlineSm, { color: colors.accent, minWidth: 20, textAlign: 'center' }]}>{value}</Text>
      <IconButton name="add" size={20} disabled={value >= max} onPress={() => onChange(value + 1)} />
    </View>
  );
}

/** Pill selector, e.g. default download format. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segment, value === o.value && styles.segmentActive]}>
          <Text style={[type.labelMd, { color: value === o.value ? colors.onAccent : colors.muted }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Artwork ──────────────────────────────────────────────────────────────────

/** Square artwork; with 2+ images shows a 2×2 collage (playlists). */
export function Artwork({ uris, size }: { uris: (string | null | undefined)[]; size: number }) {
  const list = uris.filter((u): u is string => !!u);
  const box = { width: size, height: size, borderRadius: radius.md, backgroundColor: colors.surfaceHigh };
  if (list.length < 2) {
    return list[0] ? (
      <Image source={{ uri: list[0] }} style={box} contentFit="cover" cachePolicy="memory-disk" transition={120} />
    ) : (
      <View style={[box, styles.center]}>
        <Icon name="music-note" size={size / 3} color={colors.faint} />
      </View>
    );
  }
  const half = size / 2;
  const four = [0, 1, 2, 3].map((i) => list[i % list.length]);
  return (
    <View style={[box, { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' }]}>
      {four.map((u, i) => (
        <Image key={i} source={{ uri: u }} style={{ width: half, height: half }} contentFit="cover" cachePolicy="memory-disk" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconButtonFilled: { backgroundColor: colors.surfaceHigh },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipRow: { gap: space.sm, paddingHorizontal: space.md },
  count: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-start' },
  savedDot: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, marginBottom: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
  },
  empty: { alignItems: 'center', paddingHorizontal: space.lg, paddingTop: 56, paddingBottom: space.lg },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  emptyActions: { alignSelf: 'stretch', gap: 12, marginTop: space.lg },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.pill,
    paddingHorizontal: 2,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.pill,
    padding: 3,
    gap: 3,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.accent },
});
