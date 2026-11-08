import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment } from '../../api/contracts';
import { errorMessage } from '../../api/client';
import { formatSize } from '../../shared/ui';
import { useSession } from '../auth/Session';
import { isVoiceFile, mediaType } from './media';
import { VoiceMessage } from './VoiceMessage';
import styles from './messages.module.css';

type Preview = { status: 'idle' | 'loading' } | { status: 'ready'; url: string; blob: Blob } | { status: 'error'; message: string };
export function AttachmentButton({ file }: { file: Attachment }) {
  const { api } = useSession();
  const media = mediaType(file.filename);
  const visual = media?.kind === 'image' || media?.kind === 'video';
  const mediaLabel = media?.kind === 'image' ? 'фото' : 'видео';
  const voice = isVoiceFile(file.filename);
  const container = useRef<HTMLDivElement>(null);
  const blob = useRef<Blob | null>(null);
  const previewUrl = useRef<string | null>(null);
  const pending = useRef<Promise<Blob> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cleanupDownload = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  const [nearby, setNearby] = useState(() => !('IntersectionObserver' in window));
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview>({ status: 'idle' });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const fetchBlob = useCallback(() => {
    if (blob.current) return Promise.resolve(blob.current);
    if (pending.current) return pending.current;
    const request = new AbortController();
    controller.current = request;
    const promise = api.download(file.id, request.signal).then((value) => {
      request.signal.throwIfAborted();
      blob.current = media ? new Blob([value], { type: media.mime }) : value;
      return blob.current;
    });
    pending.current = promise;
    void promise.finally(() => { if (pending.current === promise) pending.current = null; }).catch(() => undefined);
    return promise;
  }, [api, file.id, media]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      pending.current = null;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      cleanupDownload.current?.();
      blob.current = null;
    };
  }, []);
  useEffect(() => {
    if (!media || !container.current) return;
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: '300px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [media]);
  useEffect(() => {
    if (!media || !nearby) return;
    let active = true;
    void fetchBlob().then((value) => {
      if (!active || !mounted.current) return;
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(value);
      setPreview({ status: 'ready', url: previewUrl.current, blob: value });
    }).catch((cause: unknown) => {
      if (active && mounted.current && !controller.current?.signal.aborted) setPreview({ status: 'error', message: visual ? 'Не удалось загрузить медиа. Повторите попытку.' : errorMessage(cause) });
    });
    return () => { active = false; };
  }, [nearby, attempt, media, fetchBlob, visual]);
  async function handleDownload() {
    if (downloading) return;
    setDownloading(true); setError('');
    try {
      const value = await fetchBlob();
      if (!mounted.current) return;
      cleanupDownload.current?.();
      const url = URL.createObjectURL(value);
      const link = document.createElement('a');
      link.href = url; link.download = file.filename;
      document.body.append(link); link.click(); link.remove();
      const timer = window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      cleanupDownload.current = () => { window.clearTimeout(timer); URL.revokeObjectURL(url); };
    } catch (cause) { if (mounted.current && !controller.current?.signal.aborted) setError(visual ? 'Не удалось скачать медиа. Повторите попытку.' : errorMessage(cause)); }
    finally { if (mounted.current) setDownloading(false); }
  }
  if (voice) return <div ref={container} className={`${styles.attachmentGroup} ${styles.voiceGroup}`}>
    {preview.status === 'ready'
      ? <VoiceMessage src={preview.url} blob={preview.blob} sizeBytes={file.sizeBytes}
          onError={() => setPreview({ status: 'error', message: 'Не удалось воспроизвести голосовое.' })} />
      : <div className={styles.voicePlaceholder} role="status">{preview.status === 'error' ? preview.message : 'Загрузка голосового…'}</div>}
    {preview.status === 'error' && <div className={styles.voiceRecovery}>
      <button type="button" onClick={() => { blob.current = null; setPreview({ status: 'loading' }); setAttempt((value) => value + 1); }}>Повторить</button>
      <button type="button" onClick={() => void handleDownload()} disabled={downloading}>Скачать запись</button>
    </div>}
    {error && <p className={styles.downloadError} role="alert">{error}</p>}
  </div>;
  return <div ref={container} className={`${styles.attachmentGroup} ${media ? styles.mediaGroup : ''}`}>
    {media && <div className={`${styles.mediaPreview} ${media.kind === 'audio' ? styles.audioPreview : ''}`}>
      {(preview.status === 'idle' || preview.status === 'loading') && <p role="status">{media.kind === 'image' ? 'Загрузка фото…' : media.kind === 'audio' ? 'Загрузка аудио…' : 'Загрузка видео…'}</p>}
      {preview.status === 'ready' && (media.kind === 'image'
        ? <img src={preview.url} alt="Фото" onError={() => setPreview({ status: 'error', message: 'Не удалось показать фото. Скачайте фото или повторите загрузку.' })} />
        : media.kind === 'audio'
        ? <audio src={preview.url} controls preload="metadata" aria-label={file.filename.startsWith('voice-') ? 'Голосовое сообщение' : file.filename} onError={() => setPreview({ status: 'error', message: 'Браузер не воспроизводит это аудио. Скачайте файл или откройте чат в другом браузере.' })} />
        : <video src={preview.url} controls playsInline preload="metadata" aria-label="Видео" onError={() => setPreview({ status: 'error', message: 'Браузер не воспроизводит это видео. Скачайте видео или повторите загрузку.' })} />)}
      {preview.status === 'error' && <div className={styles.mediaError}><p role="alert">{preview.message}</p><button onClick={() => { blob.current = null; setPreview({ status: 'loading' }); setAttempt((value) => value + 1); }}>Повторить</button></div>}
    </div>}
    {visual ? <button className={styles.mediaSave} onClick={() => void handleDownload()} disabled={downloading} aria-label={`Скачать ${mediaLabel}, ${formatSize(file.sizeBytes)}`}>{downloading ? 'Загрузка…' : `Скачать ${mediaLabel}`}<span>{formatSize(file.sizeBytes)}</span></button> : <button className={`${styles.attachment} ${media ? styles.mediaDownload : ''}`} onClick={() => void handleDownload()} disabled={downloading} aria-label={`Скачать ${file.filename}, ${formatSize(file.sizeBytes)}`}>
      {!media && <span className={styles.downloadIcon} aria-hidden="true">↓</span>}<span className={styles.fileInfo}><strong>{file.filename}</strong><span>{formatSize(file.sizeBytes)} · {downloading ? 'Загрузка…' : 'Скачать'}</span></span>
    </button>}
    {error && <p className={styles.downloadError} role="alert">{error}</p>}
  </div>;
}
