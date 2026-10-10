import { ReactNode, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from './theme';

export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        {title ? (
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
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
  icon: string;
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
      <Text style={[styles.icon, { color }]}>{icon}</Text>
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
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    maxHeight: '75%',
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700', paddingHorizontal: 20 },
  subtitle: { color: colors.muted, fontSize: 13, paddingHorizontal: 20, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  icon: { fontSize: 18, width: 22, textAlign: 'center' },
  label: { fontSize: 15, flex: 1 },
  detail: { color: colors.muted, fontSize: 13 },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
