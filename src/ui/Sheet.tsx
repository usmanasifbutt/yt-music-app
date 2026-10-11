import { ReactNode, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from './Icon';
import { colors, radius, type } from './theme';

export function Sheet({
  visible,
  eyebrow,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  /** Small green label above the title, e.g. "DOWNLOAD FORMAT". */
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    // The scrim covers the whole screen (including behind the sheet's rounded corners);
    // tapping above the sheet closes it.
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.handle} />
        {title || eyebrow ? (
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {eyebrow ? <Text style={[type.labelMd, { color: colors.success, letterSpacing: 0.8 }]}>{eyebrow.toUpperCase()}</Text> : null}
              {title ? (
                <Text style={type.headlineMd} numberOfLines={2}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? <Text style={[type.bodyMd, { marginTop: 2 }]}>{subtitle}</Text> : null}
            </View>
            <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
              <Icon name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
        ) : null}
        {children}
      </View>
      </View>
    </Modal>
  );
}

export function SheetItem({
  icon,
  label,
  detail,
  destructive,
  disabled,
  onPress,
}: {
  /** Material icon name; omit (or 'blank') to leave the icon column empty. */
  icon?: IconName | 'blank';
  label: string;
  detail?: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = disabled ? colors.muted : destructive ? colors.accent : colors.text;
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surfaceHigh }]}>
      <View style={styles.icon}>{icon && icon !== 'blank' ? <Icon name={icon} size={22} color={color} /> : null}</View>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </Pressable>
  );
}

/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function NameDialog({
  visible,
  title,
  initial = '',
  confirmLabel = 'Save',
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (visible) setName(initial);
  }, [visible, initial]);
  if (!visible) return null;
  const valid = name.trim().length > 0;
  return (
    <Modal statusBarTranslucent navigationBarTranslucent transparent visible animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={colors.muted}
            autoFocus
            maxLength={80}
            onSubmitEditing={() => valid && onConfirm(name.trim())}
          />
          <View style={styles.dialogButtons}>
            <Pressable style={styles.dialogButton} onPress={onCancel}>
              <Text style={styles.dialogButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.dialogButton} disabled={!valid} onPress={() => onConfirm(name.trim())}>
              <Text style={[styles.dialogButtonText, { color: valid ? colors.accent : colors.muted }]}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 8,
    maxHeight: '80%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  icon: { width: 24, alignItems: 'center' },
  label: { fontSize: 15, flex: 1 },
  detail: { color: colors.muted, fontSize: 13 },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialog: { backgroundColor: colors.surface, borderRadius: 14, padding: 20 },
  dialogTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 14 },
  input: {
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  dialogButton: { paddingHorizontal: 12, paddingVertical: 8 },
  dialogButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
