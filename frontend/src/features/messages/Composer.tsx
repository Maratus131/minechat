import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../../api/client';
import { formatSize } from '../../shared/ui';
import { Icon } from '../../shared/Icon';
import { useSession } from '../auth/Session';
import { acceptMessage } from './history';
import { validateMessage } from './validation';
import { SelectedMedia } from './SelectedMedia';
import { VoiceRecorder } from './VoiceRecorder';
import { isVoiceFile } from './media';
import styles from './messages.module.css';

type SendState = { status: 'idle' } | { status: 'sending' } | { status: 'error'; message: string };
export function Composer({ id, onSent }: { id: string; onSent: () => void }) {
  const { api } = useSession();
  const cache = useQueryClient();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [state, setState] = useState<SendState>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const pending = state.status === 'sending';
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || recording) return;
    const validation = validateMessage(text, files);
    if (validation) { setState({ status: 'error', message: validation }); return; }
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'sending' });
    try {
      const message = await api.send(id, text.trim(), files, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      acceptMessage(cache, message);
      setText('');
      setFiles([]);
      setState({ status: 'idle' });
      onSent();
      textInput.current?.focus();
    } catch (cause) {
      if (!mounted.current) return;
      setState({ status: 'error', message: controller.signal.aborted
        ? 'Отправка остановлена. Сообщение могло сохраниться: проверьте историю перед повтором.' : errorMessage(cause) });
    }
  }
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!pending) form.current?.requestSubmit();
    }
  }
  function handleFiles(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)];
    const validation = validateMessage(text || ' ', next);
    if (validation) setState({ status: 'error', message: validation });
    else { setFiles(next); setState({ status: 'idle' }); }
    if (fileInput.current) fileInput.current.value = '';
  }
  return <form className={styles.composer} onSubmit={handleSubmit} ref={form} aria-label="Отправить сообщение">
    {files.length > 0 && <ul className={styles.selectedFiles}>{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><SelectedMedia file={file} />{!isVoiceFile(file.name) && <span>{file.name} <small>{formatSize(file.size)}</small></span>}<button type="button" disabled={pending} onClick={() => setFiles(files.filter((_, position) => position !== index))} aria-label={isVoiceFile(file.name) ? 'Убрать голосовое' : `Убрать ${file.name}`}>×</button></li>)}</ul>}
    {state.status === 'error' && <p className={styles.sendError} role="alert">{state.message}</p>}
    <div className={styles.composerRow}>
      <input ref={fileInput} className="srOnly" type="file" multiple onChange={(event) => handleFiles(event.target.files)} tabIndex={-1} aria-label="Выбрать файлы" disabled={pending || recording} />
      <button type="button" className={styles.attachButton} aria-label="Прикрепить файл" title="Прикрепить файл" disabled={pending || recording || files.length >= 5} onClick={() => fileInput.current?.click()}><Icon name="attach" /></button>
      <label className="srOnly" htmlFor="message-text">Сообщение</label>
      <textarea id="message-text" ref={textInput} rows={1} maxLength={4096} value={text} readOnly={pending} placeholder="Сообщение…" aria-describedby="message-limits" onChange={(event) => setText(event.target.value)} onKeyDown={handleKeyDown} />
      <VoiceRecorder disabled={pending || files.length >= 5} onActiveChange={setRecording} onReady={(file) => setFiles((current) => [...current, file])} />
      <button type="submit" className={`primary ${styles.sendButton}`} aria-label={pending ? 'Отправка сообщения' : 'Отправить сообщение'} title="Отправить сообщение" disabled={pending || recording || (!text.trim() && files.length === 0)}><Icon name="send" /><span>{pending ? 'Отправка…' : 'Отправить'}</span></button>
    </div>
    <div className={styles.composerHint}><span id="message-limits">До 5 файлов по 10 МиБ · {text.length ? `${text.length}/4096` : 'до 4096 символов'}</span>{pending ? <button type="button" onClick={() => request.current?.abort()}>Остановить</button> : <span className={styles.enterHint}>Shift + Enter — новая строка</span>}</div>
  </form>;
}
