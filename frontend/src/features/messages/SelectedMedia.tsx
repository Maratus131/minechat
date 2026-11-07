import { useEffect, useRef } from 'react';
import { mediaType } from './media';
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
  return <span className={styles.selectedPreview}>{media.kind === 'image'
    ? <img ref={image} alt={`Выбрано: ${file.name}`} />
    : media.kind === 'audio'
    ? <audio ref={audio} controls preload="metadata" aria-label="Прослушать голосовое перед отправкой" />
    : <video ref={video} controls playsInline preload="metadata" aria-label={`Выбрано: ${file.name}`} />}</span>;
}
