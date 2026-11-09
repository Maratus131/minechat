import { useEffect, useRef, type ReactNode } from 'react';
import { errorMessage } from '../api/client';
import styles from './ui.module.css';

function AvatarImage({ blob }: { blob: Blob }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    const url = URL.createObjectURL(blob);
    element.src = url;
    return () => { element.removeAttribute('src'); URL.revokeObjectURL(url); };
  }, [blob]);
  return <img ref={image} alt="" />;
}
export function Avatar({ name, imageUrl, imageBlob }: { name: string; imageUrl?: string | null; imageBlob?: Blob }) {
  return <span className={styles.avatar} aria-hidden="true">{imageBlob ? <AvatarImage blob={imageBlob} /> : imageUrl ? <img src={imageUrl} alt="" /> : Array.from(name.trim()).slice(0, 2).join('').toLocaleUpperCase('ru')}</span>;
}
export function Brand() {
  return <span className={styles.brand}><span className={styles.block} aria-hidden="true" /><span>MINECHAT</span></span>;
}
export function StatusPanel({ title, children, kind = 'empty', retry }: {
  title: string; children?: ReactNode; kind?: 'empty' | 'loading' | 'error'; retry?: () => void;
}) {
  return <div className={styles.status} role={kind === 'error' ? 'alert' : 'status'}>
    <span className={`${styles.symbol} ${styles[kind]}`} aria-hidden="true">{kind === 'error' ? '!' : kind === 'loading' ? '…' : '+'}</span>
    <h2>{title}</h2>
    {children && <div className={styles.description}>{children}</div>}
    {retry && <button onClick={retry}>Повторить</button>}
    {kind === 'loading' && <span className={styles.loader} aria-hidden="true" />}
  </div>;
}
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div className={styles.errorNotice} role="alert"><span>{errorMessage(error)}</span>{retry && <button onClick={retry}>Повторить</button>}</div>;
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(new Date(value));
}
export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  const unit = bytes < 1024 * 1024 ? 'КиБ' : 'МиБ';
  return `${new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(bytes / (unit === 'КиБ' ? 1024 : 1024 * 1024))} ${unit}`;
}
