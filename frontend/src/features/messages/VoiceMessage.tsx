import { useEffect, useRef, useState } from 'react';
import { formatSize } from '../../shared/ui';
import styles from './messages.module.css';

const BAR_COUNT = 48;
const EMPTY_BARS = Array.from({ length: BAR_COUNT }, () => 0.2);

function timeLabel(seconds: number) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function VoiceMessage({ src, blob, sizeBytes, onError }: {
  src?: string; blob: Blob; sizeBytes: number; onError?: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState(EMPTY_BARS);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const url = src || URL.createObjectURL(blob);
    element.src = url;
    const pauseForOtherAudio = (event: Event) => {
      if (event.target !== element && event.target instanceof HTMLAudioElement) element.pause();
    };
    document.addEventListener('play', pauseForOtherAudio, true);
    return () => {
      document.removeEventListener('play', pauseForOtherAudio, true);
      element.pause(); element.removeAttribute('src'); element.load();
      if (!src) URL.revokeObjectURL(url);
    };
  }, [src, blob]);

  useEffect(() => {
    if (typeof AudioContext === 'undefined') return;
    let active = true;
    let context: AudioContext;
    try { context = new AudioContext(); } catch { return; }
    void blob.arrayBuffer().then((data) => context.decodeAudioData(data)).then((buffer) => {
      if (!active) return;
      const samples = buffer.getChannelData(0);
      const block = Math.max(1, Math.floor(samples.length / BAR_COUNT));
      const peaks = EMPTY_BARS.map((_, index) => {
        let peak = 0;
        const end = Math.min(samples.length, (index + 1) * block);
        for (let sample = index * block; sample < end; sample += Math.max(1, Math.floor(block / 150))) {
          peak = Math.max(peak, Math.abs(samples[sample] ?? 0));
        }
        return peak;
      });
      const maximum = Math.max(...peaks, 0.001);
      setWaveform(peaks.map((peak) => Math.max(0.15, peak / maximum)));
      setDuration(buffer.duration);
    }).catch(() => { /* Equal bars remain a seekable timeline when waveform decoding is unavailable. */ })
      .finally(() => { void context.close().catch(() => undefined); });
    return () => { active = false; void context.close().catch(() => undefined); };
  }, [blob]);

  async function togglePlayback() {
    const element = audio.current;
    if (!element) return;
    setError('');
    try {
      if (element.paused) { if (element.ended) element.currentTime = 0; await element.play(); }
      else element.pause();
    } catch { setError('Не удалось воспроизвести запись. Попробуйте ещё раз.'); }
  }

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  return <div className={styles.voicePlayer} aria-label="Голосовое сообщение">
    <audio ref={audio} preload="metadata" onLoadedMetadata={() => {
      setLoaded(true);
      if (Number.isFinite(audio.current?.duration)) setDuration(audio.current?.duration ?? 0);
    }} onCanPlay={() => setLoaded(true)} onPlay={() => {
      document.querySelectorAll('audio').forEach((element) => { if (element !== audio.current) element.pause(); });
      setPlaying(true);
    }} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onTimeUpdate={() => setPosition(audio.current?.currentTime ?? 0)}
      onError={() => { setError('Этот браузер не воспроизводит запись.'); onError?.(); }} />
    <button type="button" className={styles.voicePlay} disabled={!loaded} onClick={() => void togglePlayback()}
      aria-label={playing ? 'Приостановить голосовое' : 'Слушать голосовое'} aria-pressed={playing}>
      {playing ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v18l15-9z" /></svg>}
    </button>
    <div className={styles.voiceBody}>
      <div className={styles.voiceTimeline}>
        <div className={styles.voiceBars} aria-hidden="true">{waveform.map((height, index) =>
          <span key={index} className={index / BAR_COUNT < progress ? styles.voiceBarPlayed : ''} style={{ height: `${Math.max(4, height * 25)}px` }} />)}</div>
        <input type="range" min={0} max={duration || 1} step={0.05} value={Math.min(position, duration || 1)}
          disabled={!loaded || duration <= 0} aria-label="Позиция голосового сообщения"
          aria-valuetext={`${timeLabel(position)} из ${timeLabel(duration)}`} onChange={(event) => {
            const next = Number(event.target.value);
            if (audio.current) audio.current.currentTime = next;
            setPosition(next);
          }} />
      </div>
      <span className={styles.voiceMeta}>{loaded ? `${timeLabel(position > 0 ? position : duration)} · ${formatSize(sizeBytes)}` : 'Загрузка…'}</span>
    </div>
    {error && <p className={styles.voiceError} role="alert">{error}</p>}
  </div>;
}
