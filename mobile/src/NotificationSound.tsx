import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Switch, Text, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import type { Message } from '../../frontend/src/api/contracts';
import { createIncomingSoundGate } from './incomingSound';
import { useSession } from './session';
import { colors, Label, s } from './ui';

interface SoundSettings {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  incoming: (message: Message, alreadyLoaded: boolean) => void;
  error: string;
}
const Context = createContext<SoundSettings | null>(null);

export function NotificationSoundProvider({ children }: PropsWithChildren) {
  const { auth } = useSession();
  const player = useAudioPlayer(require('../assets/levelup.mp3'));
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');
  const current = useRef({ userId: auth?.user.id, enabled });
  current.current = { userId: auth?.user.id, enabled };
  const gate = useRef({ userId: auth?.user.id, accepts: createIncomingSoundGate(auth?.user.id ?? '') });
  if (gate.current.userId !== auth?.user.id) gate.current = { userId: auth?.user.id, accepts: createIncomingSoundGate(auth?.user.id ?? '') };
  const playing = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    player.volume = 0.65;
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') player.pause(); });
    return () => { mounted.current = false; subscription.remove(); };
  }, [player]);
  useEffect(() => { if (!enabled || !auth) player.pause(); }, [auth, enabled, player]);

  function incoming(message: Message, alreadyLoaded: boolean) {
    if (!gate.current.accepts(message, alreadyLoaded) || !auth || !enabled || AppState.currentState !== 'active' || playing.current) return;
    const userId = auth.user.id;
    playing.current = true;
    void (async () => {
      try {
        await player.seekTo(0);
        if (mounted.current && current.current.userId === userId && current.current.enabled && AppState.currentState === 'active') {
          player.play();
          setError('');
        }
      } catch { if (mounted.current && current.current.userId === userId) setError('Не удалось воспроизвести звук уведомления.'); }
      finally { playing.current = false; }
    })();
  }

  return <Context.Provider value={{ enabled, setEnabled, incoming, error }}>{children}</Context.Provider>;
}

export function useNotificationSound() {
  const context = useContext(Context);
  if (!context) throw new Error('NotificationSoundProvider is required');
  return context;
}

export function NotificationSoundSettings() {
  const { enabled, setEnabled, error } = useNotificationSound();
  return <View style={{ gap: 8, paddingVertical: 12 }}>
    <View style={s.row}>
      <View style={s.fill}><Label>Звук новых сообщений</Label></View>
      <Switch accessibilityLabel="Звук новых сообщений" value={enabled} onValueChange={setEnabled} trackColor={{ false: '#626b59', true: colors.accent }} thumbColor={colors.incoming} />
    </View>
    <Label>Level up звучит, пока приложение открыто. Звук зависит от громкости устройства.</Label>
    {!!error && <Text accessibilityRole="alert" style={s.notice}>{error}</Text>}
  </View>;
}
