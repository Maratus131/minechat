import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { errorMessage, type PickedFile } from './api';
import { discardFile, stageFile } from './files';
import { audioTime } from './AudioMessage';
import { Button, Notice, s } from './ui';

export function VoiceRecorder({ disabled, onRecorded, onBusyChange }: {
  disabled: boolean; onRecorded: (file: PickedFile) => void; onBusyChange: (busy: boolean) => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const status = useAudioRecorderState(recorder, 200);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'stopping'>('idle');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const active = useRef(false);
  const stopping = useRef(false);
  const cancelled = useRef(false);
  const callbacks = useRef({ onRecorded, onBusyChange });
  callbacks.current = { onRecorded, onBusyChange };

  async function stop(keep: boolean) {
    if (!keep) cancelled.current = true;
    if (!active.current || stopping.current) return;
    stopping.current = true;
    if (mounted.current) setPhase('stopping');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri && keep && !cancelled.current && mounted.current) {
        const file = { ...await stageFile(uri, `voice-${Date.now()}.m4a`), mimeType: 'audio/mp4' };
        if (mounted.current && !cancelled.current) callbacks.current.onRecorded(file);
        else await discardFile(file.uri);
      } else if (uri) await discardFile(uri);
    } catch (failure) { if (mounted.current) setError(errorMessage(failure)); }
    finally {
      active.current = false; stopping.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      if (mounted.current) { setPhase('idle'); callbacks.current.onBusyChange(false); }
    }
  }
  const stopRef = useRef(stop); stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => { if (state !== 'active') { cancelled.current = true; void stopRef.current(false); } });
    return () => { mounted.current = false; cancelled.current = true; subscription.remove(); void stopRef.current(false); };
  }, []);
  useEffect(() => { if (status.durationMillis >= 120000 && active.current) void stopRef.current(true); }, [status.durationMillis]);

  async function start() {
    if (phase !== 'idle' || disabled) return;
    setPhase('starting'); setError(''); cancelled.current = false; callbacks.current.onBusyChange(true);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Разрешите доступ к микрофону в настройках устройства.');
      if (!mounted.current || cancelled.current) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      active.current = true;
      if (!mounted.current || cancelled.current) { await stop(false); return; }
      recorder.record(); setPhase('recording');
    } catch (failure) {
      if (active.current) await stop(false);
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      if (!active.current) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
        if (mounted.current) { setPhase('idle'); callbacks.current.onBusyChange(false); }
      }
    }
  }
  return <View style={{ gap: 8 }}>
    {phase === 'idle' ? <Button title="Голосовое" disabled={disabled} onPress={() => { void start(); }} /> : <>
      <Text style={s.text}>{phase === 'starting' ? 'Подготовка микрофона…' : phase === 'stopping' ? 'Сохранение записи…' : `Запись ${audioTime(status.durationMillis / 1000)} / 2:00`}</Text>
      <View style={s.row}>
        <Button title="Остановить" disabled={phase !== 'recording'} onPress={() => { void stop(true); }} />
        <Button title="Отменить запись" disabled={phase === 'stopping'} onPress={() => { cancelled.current = true; void stop(false); }} />
      </View>
    </>}
    {!!error && <Notice text={error} />}
  </View>;
}
