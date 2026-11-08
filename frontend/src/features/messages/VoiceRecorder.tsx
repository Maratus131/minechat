import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../shared/Icon';
import styles from './messages.module.css';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SECONDS = 120;

export function VoiceRecorder({ disabled, onActiveChange, onReady }: {
  disabled: boolean; onActiveChange: (active: boolean) => void; onReady: (file: File) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const discard = useRef(false);

  useEffect(() => () => {
    generation.current++;
    window.clearInterval(timer.current);
    const current = recorder.current;
    if (current) {
      current.ondataavailable = null;
      current.onstop = null;
      current.onerror = null;
      if (current.state !== 'inactive') current.stop();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function stop(cancel: boolean) {
    discard.current = cancel;
    generation.current++;
    window.clearInterval(timer.current);
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    if (!recorder.current) { setStatus('idle'); onActiveChange(false); }
  }

  async function start() {
    if (disabled || status !== 'idle') return;
    setError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Для записи откройте чат по HTTPS или на localhost.'); return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('Этот браузер не поддерживает запись голоса. Попробуйте другой браузер.'); return;
    }
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
      .find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) { setError('В браузере нет поддерживаемого формата записи голоса.'); return; }
    const ticket = ++generation.current;
    setStatus('requesting'); onActiveChange(true);
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (ticket !== generation.current) { input.getTracks().forEach((track) => track.stop()); return; }
      stream.current = input;
      const current = new MediaRecorder(input, { mimeType: mime, audioBitsPerSecond: 64000 });
      recorder.current = current;
      discard.current = false;
      const chunks: Blob[] = [];
      let size = 0;
      current.ondataavailable = ({ data }) => {
        size += data.size;
        if (size > MAX_BYTES) {
          discard.current = true;
          setError('Запись превысила 10 МиБ. Запишите более короткое сообщение.');
          if (current.state !== 'inactive') stop(true);
          return;
        }
        if (data.size) chunks.push(data);
      };
      current.onerror = () => { setError('Не удалось записать голос. Проверьте микрофон и попробуйте ещё раз.'); stop(true); };
      current.onstop = () => {
        window.clearInterval(timer.current);
        input.getTracks().forEach((track) => track.stop());
        recorder.current = null; stream.current = null;
        setStatus('idle'); onActiveChange(false);
        if (discard.current) return;
        if (!size) { setError('Запись получилась пустой. Попробуйте ещё раз.'); return; }
        const extension = mime.startsWith('audio/mp4') ? 'm4a' : mime.startsWith('audio/ogg') ? 'ogg' : 'weba';
        onReady(new File(chunks, `voice-${Date.now()}.${extension}`, { type: mime }));
      };
      current.start(250);
      setSeconds(0); setStatus('recording');
      const started = Date.now();
      timer.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, MAX_SECONDS));
        if (elapsed >= MAX_SECONDS) stop(false);
      }, 250);
    } catch (cause) {
      if (ticket !== generation.current) return;
      stream.current?.getTracks().forEach((track) => track.stop());
      recorder.current = null; stream.current = null;
      setStatus('idle'); onActiveChange(false);
      setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
        ? 'Доступ к микрофону запрещён. Разрешите его в настройках браузера и повторите запись.'
        : 'Микрофон недоступен. Проверьте подключение и попробуйте ещё раз.');
    }
  }

  return <div className={styles.voiceRecorder} data-active={status !== 'idle' || !!error}>
    {status === 'idle' ? <button type="button" aria-label="Записать голосовое сообщение" title="Записать голосовое сообщение" disabled={disabled} onClick={() => void start()}><Icon name="mic" /></button>
      : <>
        <span role="status">{status === 'requesting' ? 'Разрешите доступ к микрофону…' : `Запись ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} / 2:00`}</span>
        {status === 'recording' && <button type="button" onClick={() => stop(false)}>Завершить запись</button>}
        <button type="button" onClick={() => stop(true)}>Отмена</button>
      </>}
    {error && <p className={styles.sendError} role="alert">{error}</p>}
  </div>;
}
