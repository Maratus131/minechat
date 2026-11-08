import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, s } from './ui';

export type IconName = 'pencil' | 'search' | 'close' | 'back' | 'more' | 'attach' | 'send' | 'mic' | 'people' | 'chats' | 'profile';

export function Icon({ name, color = colors.ink }: { name: IconName; color?: string }) {
  const line = (style: ViewStyle, key: string) => <View key={key} style={[styles.line, { backgroundColor: color }, style]} />;
  return <View style={styles.icon} accessible={false} importantForAccessibility="no-hide-descendants">
    {name === 'more' ? [4, 11, 18].map((left) => line({ width: 3, height: 3, left, top: 10 }, String(left)))
      : name === 'search' ? <><View style={[styles.search, { borderColor: color }]} />{line({ width: 9, left: 14, top: 18, transform: [{ rotate: '45deg' }] }, 'handle')}</>
      : name === 'close' ? <>{line({ width: 21, left: 1, top: 11, transform: [{ rotate: '45deg' }] }, 'a')}{line({ width: 21, left: 1, top: 11, transform: [{ rotate: '-45deg' }] }, 'b')}</>
      : name === 'back' || name === 'send' ? <View style={[styles.icon, name === 'send' && styles.forward]}>{line({ width: 17, left: 3, top: 11 }, 'stem')}{line({ width: 11, left: 1, top: 7, transform: [{ rotate: '-45deg' }] }, 'top')}{line({ width: 11, left: 1, top: 15, transform: [{ rotate: '45deg' }] }, 'bottom')}</View>
      : name === 'mic' ? <><View style={[styles.mic, { borderColor: color }]} /><View style={[styles.micBase, { borderColor: color }]} />{line({ width: 2, height: 4, top: 18, left: 11 }, 'stem')}{line({ width: 10, left: 7, top: 21 }, 'foot')}</>
      : name === 'pencil' ? <>{line({ width: 18, height: 5, left: 4, top: 9, transform: [{ rotate: '-45deg' }] }, 'pencil')}{line({ width: 5, height: 5, left: 2, top: 17 }, 'tip')}</>
      : name === 'attach' ? <><View style={[styles.attachment, { borderColor: color }]} />{line({ width: 2, height: 12, left: 12, top: 6 }, 'inner')}</>
      : name === 'chats' ? <><View style={[styles.chat, { borderColor: color }]} />{line({ width: 5, height: 5, top: 17, left: 4 }, 'tail')}</>
      : <><View style={[styles.personHead, { borderColor: color }]} /><View style={[styles.personBody, { borderColor: color }]} />{name === 'people' && <View style={[styles.secondPerson, { borderColor: color }]} />}</>}
  </View>;
}

export function IconButton({ icon, label, onPress, disabled = false, primary = false }: {
  icon: IconName; label: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, primary && styles.primary, (pressed || disabled) && s.dim]}><Icon name={icon} /></Pressable>;
}

const styles = StyleSheet.create({
  icon: { width: 24, height: 24 }, line: { position: 'absolute', height: 2 },
  button: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 2, borderTopColor: '#f1f1eb', borderLeftColor: '#f1f1eb', borderBottomColor: '#686d63', borderRightColor: '#686d63' },
  primary: { backgroundColor: colors.accent }, forward: { width: 24, height: 24, transform: [{ rotate: '180deg' }] },
  search: { position: 'absolute', left: 3, top: 2, width: 15, height: 15, borderWidth: 2 },
  mic: { position: 'absolute', left: 8, top: 1, width: 8, height: 13, borderWidth: 2, borderRadius: 4 },
  micBase: { position: 'absolute', left: 5, top: 9, width: 14, height: 10, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  attachment: { position: 'absolute', left: 6, top: 2, width: 12, height: 21, borderWidth: 2, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  chat: { position: 'absolute', left: 2, top: 3, width: 20, height: 16, borderWidth: 2 },
  personHead: { position: 'absolute', left: 8, top: 2, width: 9, height: 9, borderWidth: 2 },
  personBody: { position: 'absolute', left: 4, top: 14, width: 17, height: 9, borderWidth: 2 },
  secondPerson: { position: 'absolute', left: 1, top: 5, width: 5, height: 7, borderWidth: 2 },
});
