import { useEffect, useRef } from 'react';
import { isVoiceFile, mediaType } from './media';
import { VoiceMessage } from './VoiceMessage';
import styles from './messages.module.css';

export function SelectedMedia({ file }: { file: File }) {
  const media = mediaType(file.name);
  const image = useRef<HTMLImageElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = image.current ?? video.current ?? audio.current;
    if (!media || !element) return;
    const url = URL.createObjectURL(new Blob([file], { type: media.mime }));
    element.src = url;
    return () => {
      element.removeAttribute('src');
      if (element instanceof HTMLMediaElement) { element.pause(); element.load(); }
      URL.revokeObjectURL(url);
    };
  }, [file, media]);
  if (!media) return null;
  if (isVoiceFile(file.name)) return <span className={`${styles.selectedPreview} ${styles.selectedVoice}`}><VoiceMessage blob={file} sizeBytes={file.size} /></span>;
  return <span className={styles.selectedPreview}>{media.kind === 'image'
    ? <img ref={image} alt="Выбранное фото" />
    : media.kind === 'audio'
    ? <audio ref={audio} controls preload="metadata" aria-label={`Аудио: ${file.name}`} />
    : <video ref={video} controls playsInline preload="metadata" aria-label="Выбранное видео" />}</span>;
}
