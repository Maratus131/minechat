import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { PropsWithChildren } from 'react';

export const colors = { background: '#252c23', panel: '#c6c6c6', chat: '#373d33', incoming: '#e5e5db', mine: '#d7e5b8', accent: '#88b548', ink: '#252c23' };
export function Label({ children }: PropsWithChildren) { return <Text style={s.text}>{children}</Text>; }
export function Title({ children }: PropsWithChildren) { return <Text accessibilityRole="header" numberOfLines={2} style={s.title}>{children}</Text>; }
export function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, (disabled || pressed) && s.dim]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={s.field}><Label>{label}</Label><TextInput accessibilityLabel={label} placeholderTextColor="#686e61" {...props} style={[s.input, props.style]} /></View>;
}
export function Notice({ text }: { text: string }) { return <Text accessibilityRole="alert" style={s.notice}>{text}</Text>; }
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, fill: { flex: 1 },
  title: { color: colors.incoming, fontFamily: 'PressStart2P_400Regular', fontSize: 16, lineHeight: 27, paddingVertical: 8 },
  text: { color: colors.incoming, fontFamily: 'RobotoMono_400Regular', fontSize: 14, lineHeight: 22 },
  ink: { color: colors.ink, fontFamily: 'RobotoMono_400Regular', fontSize: 14, lineHeight: 22 },
  button: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', backgroundColor: colors.panel, borderWidth: 3, borderTopColor: '#f1f1eb', borderLeftColor: '#f1f1eb', borderBottomColor: '#686d63', borderRightColor: '#686d63' },
  buttonText: { fontFamily: 'RobotoMono_400Regular', fontSize: 13, color: colors.ink, textAlign: 'center' },
  dim: { opacity: 0.5 }, field: { gap: 6 },
  input: { fontFamily: 'RobotoMono_400Regular', color: colors.ink, backgroundColor: colors.incoming, padding: 12, minHeight: 48, borderWidth: 2, borderColor: '#161c14', fontSize: 16 },
  notice: { color: '#ffd6c8', fontFamily: 'RobotoMono_400Regular', lineHeight: 22, padding: 10 },
  item: { backgroundColor: colors.panel, padding: 12, gap: 4, borderBottomWidth: 2, borderBottomColor: '#757b6c', minHeight: 76 },
  avatar: { width: 44, height: 44, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.accent, color: colors.ink, fontSize: 20, borderWidth: 3, borderTopColor: colors.incoming, borderLeftColor: colors.incoming, borderRightColor: '#4c622d', borderBottomColor: '#4c622d' },
});
