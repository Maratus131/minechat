import { useRef } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, s } from './ui';

export type SheetAction = { title: string; onPress: () => void; disabled?: boolean; destructive?: boolean };

export function ActionSheet({ title, visible, onClose, actions, description }: {
  title: string; visible: boolean; onClose: () => void; actions: SheetAction[]; description?: string;
}) {
  const pendingAction = useRef<(() => void) | null>(null);
  function runPendingAction() {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  }
  function select(action: SheetAction) {
    Keyboard.dismiss();
    pendingAction.current = action.onPress;
    onClose();
    if (Platform.OS !== 'ios') requestAnimationFrame(runPendingAction);
  }
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} onDismiss={runPendingAction}>
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Закрыть меню" accessibilityRole="button" onPress={onClose} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet} accessibilityViewIsModal>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{title}</Text></View>
          {!!description && <Text style={styles.description}>{description}</Text>}
          {actions.map((action) => <Pressable key={action.title} accessibilityRole="button" accessibilityState={{ disabled: !!action.disabled }} disabled={action.disabled}
            onPress={() => select(action)} style={({ pressed }) => [styles.action, pressed && styles.selected, action.disabled && s.dim]}>
            <Text style={[styles.actionText, action.destructive && styles.destructive]}>{action.title}</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={styles.actionText}>Закрыть</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.panel, borderWidth: 2, borderColor: '#171e14', maxHeight: '80%' },
  heading: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#92978a' },
  title: { fontFamily: 'RobotoMono_400Regular', fontSize: 17, fontWeight: '700', color: colors.ink },
  description: { paddingHorizontal: 18, paddingVertical: 12, color: '#50584a', fontSize: 13, lineHeight: 20 },
  action: { minHeight: 56, paddingHorizontal: 18, paddingVertical: 16, justifyContent: 'center' },
  actionText: { fontFamily: 'RobotoMono_400Regular', fontSize: 14, color: colors.ink },
  selected: { backgroundColor: colors.mine }, destructive: { color: '#842f22' },
  close: { minHeight: 52, padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#92978a' },
});
