import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INTERESTS, interestsStore, saveInterests } from '../interests';
import { useStore } from '../store';
import { Icon } from './Icon';
import { Button } from './kit';
import { colors, radius, space, type } from './theme';

/** Full-screen chooser. Shown on first launch, and from Home → Interests or Settings. */
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
      <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.md }]}>
        <Text style={type.headlineLg}>What do you listen to?</Text>
        <Text style={[type.bodyMd, { marginTop: space.sm }]}>
          Pick a few and Home will fill up with them. You can change this anytime.
        </Text>
        <View style={styles.counter}>
          <View style={styles.counterPill}>
            <Icon name="auto-awesome" size={16} color={colors.success} />
            <Text style={type.labelLg}>{picked.size} selected</Text>
          </View>
          {!picked.size && <Text style={type.bodySm}>Choose at least 1 to continue</Text>}
        </View>
        <ScrollView contentContainerStyle={styles.chips}>
          {INTERESTS.map((i) => {
            const on = picked.has(i.id);
            return (
              <Pressable key={i.id} onPress={() => toggle(i.id)} style={[styles.chip, on && styles.chipOn]}>
                <Icon name={on ? 'check' : i.icon} size={20} color={on ? colors.onAccent : colors.muted} />
                <Text style={[type.bodyLg, on && { color: colors.onAccent, fontWeight: '700' }]}>{i.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Button
          label={firstTime ? 'Continue' : 'Save'}
          icon={firstTime ? 'arrow-forward' : 'check'}
          disabled={!picked.size}
          onPress={() => done(INTERESTS.filter((i) => picked.has(i.id)).map((i) => i.id))}
        />
        <Button label={firstTime ? 'Skip for now' : 'Cancel'} variant="ghost" onPress={() => (firstTime ? done([]) : onClose())} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.md, gap: space.sm },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: space.md },
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  chipOn: { backgroundColor: colors.accent },
});
