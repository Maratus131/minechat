import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { RobotoMono_400Regular } from '@expo-google-fonts/roboto-mono';
import { SessionProvider, useSession } from '../src/session';
import { initializeFiles } from '../src/files';
import { Label, Notice, s } from '../src/ui';
import { useRealtime } from '../src/realtime';
import { NotificationSoundProvider } from '../src/NotificationSound';

function Routes() {
  const { auth } = useSession();
  const connection = useRealtime();
  return <>{auth && connection !== 'Подключено' && <Text accessibilityLiveRegion="polite" style={styles.connection}>{connection}</Text>}<Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#252c23' } }}>
    <Stack.Protected guard={!!auth}><Stack.Screen name="index" /><Stack.Screen name="create" /><Stack.Screen name="group/create" /><Stack.Screen name="chat/[id]" /><Stack.Screen name="members/[id]" /></Stack.Protected>
    <Stack.Protected guard={!auth}><Stack.Screen name="login" /></Stack.Protected>
  </Stack></>;
}
const styles = StyleSheet.create({
  connection: { color: '#252c23', backgroundColor: '#d7e5b8', fontFamily: 'RobotoMono_400Regular', fontSize: 10, lineHeight: 17, paddingHorizontal: 12, paddingVertical: 5 },
});
export default function Layout() {
  const [loaded, error] = useFonts({ PressStart2P_400Regular, RobotoMono_400Regular });
  const [filesReady, setFilesReady] = useState(false);
  useEffect(() => { void initializeFiles().then(() => setFilesReady(true)); }, []);
  return <SafeAreaProvider><SafeAreaView style={s.screen}>
    <StatusBar style="light" />
    {(!loaded && !error) || !filesReady ? <Label>Загрузка приложения…</Label> : <SessionProvider><NotificationSoundProvider>{error && <Notice text="Шрифты не загрузились. Используется системный шрифт." />}<Routes /></NotificationSoundProvider></SessionProvider>}
  </SafeAreaView></SafeAreaProvider>;
}
