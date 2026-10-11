import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INTERESTS, interestsStore, saveInterests } from '../interests';
import { useStore } from '../store';
import { Icon } from './Icon';
import { colors } from './theme';

/** Full-screen chooser. Shown on first launch, and from Home → Edit. */
export function InterestPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const saved = useStore(interestsStore);
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // First launch starts with nothing picked; later edits start from the saved picks.
  useEffect(() => {
    if (visible) setPicked(new Set(saved ?? []));
  }, [visible]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function done(ids: string[]) {
    saveInterests(ids);
    onClose();
  }

  const firstTime = saved === null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (firstTime ? done([...picked]) : onClose())}>
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>What do you listen to?</Text>
        <Text style={styles.subtitle}>Pick a few and Home will fill up with them. You can change this anytime.</Text>
        <ScrollView contentContainerStyle={styles.chips}>
          {INTERESTS.map((i) => {
            const on = picked.has(i.id);
            return (
              <Pressable key={i.id} onPress={() => toggle(i.id)} style={[styles.chip, on && styles.chipOn]}>
                <Icon name={on ? 'check' : i.icon} size={18} color={on ? '#fff' : colors.muted} />
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{i.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          style={[styles.primary, !picked.size && { opacity: 0.4 }]}
          disabled={!picked.size}
          onPress={() => done(INTERESTS.filter((i) => picked.has(i.id)).map((i) => i.id))}>
          <Text style={styles.primaryText}>{firstTime ? 'Continue' : 'Save'}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => (firstTime ? done([]) : onClose())}>
          <Text style={styles.secondaryText}>{firstTime ? 'Skip for now' : 'Cancel'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 8, marginBottom: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 15 },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  primary: { backgroundColor: colors.accent, borderRadius: 26, paddingVertical: 15, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: colors.muted, fontSize: 15 },
});
