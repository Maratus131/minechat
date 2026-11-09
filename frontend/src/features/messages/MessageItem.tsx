import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Message } from '../../api/contracts';
import { errorMessage } from '../../api/client';
import { formatDate, formatTime } from '../../shared/ui';
import { AttachmentButton } from './AttachmentButton';
import { UserAvatar } from '../profile/UserAvatar';
import { useMessageMenu, type MessageAction } from './ContextMenu';
import { mediaType } from './media';
import styles from './messages.module.css';

export function MessageItem({ message, mine, showDate = false, onDelete, deleting = false, onEdit }: { message: Message; mine: boolean; showDate?: boolean; onDelete?: () => void; deleting?: boolean; onEdit?: (text: string, signal: AbortSignal) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const article = useRef<HTMLElement>(null);
  const photos = message.attachments.filter((file) => mediaType(file.filename)?.kind === 'image');
  const showEditor = editing && !message.deleted && !!onEdit;
  useEffect(() => () => request.current?.abort(), []);
  const actions: MessageAction[] = [];
  if (!message.deleted && onEdit) actions.push({ label: 'Изменить', run: () => { setDraft(message.text); setError(''); setEditing(true); } });
  if (!message.deleted && onDelete) actions.push({ label: deleting ? 'Удаляем…' : 'Удалить', run: onDelete, disabled: deleting });
  const { handlers, menu } = useMessageMenu(showEditor ? [] : actions);
  function cancel() { request.current?.abort(); setEditing(false); setSaving(false); setError(''); article.current?.focus({ preventScroll: true }); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!onEdit || saving) return;
    if (!draft.trim() && !message.attachments.length) { setError('Добавьте текст сообщения.'); return; }
    if (draft.length > 4096 || draft.includes('\0')) { setError('Допустимо до 4096 символов без нулевого символа.'); return; }
    const controller = new AbortController(); request.current = controller;
    setSaving(true); setError('');
    try { await onEdit(draft, controller.signal); if (!controller.signal.aborted) cancel(); }
    catch (cause) { if (!controller.signal.aborted) setError(errorMessage(cause)); }
    finally { if (!controller.signal.aborted) setSaving(false); }
  }
  return <article ref={article} {...handlers} tabIndex={!message.deleted ? 0 : undefined} aria-haspopup={actions.length ? 'menu' : undefined} className={`${styles.message} ${mine ? styles.mine : ''}`} aria-label={`${mine ? 'Вы' : message.sender.displayName}, ${formatTime(message.createdAt)}`}>
    <UserAvatar user={message.sender} />
    {showEditor ? <form className={styles.editForm} onSubmit={(event) => void save(event)}>
      <label>Изменить сообщение<textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4096} disabled={saving} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } }} /></label>
      {error && <p role="alert">{error}</p>}
      <div><button type="submit" disabled={saving || (!draft.trim() && !message.attachments.length)}>{saving ? 'Сохранение…' : 'Сохранить'}</button><button type="button" onClick={cancel}>Отмена</button></div>
    </form> : (message.text || message.deleted) && <div className={styles.bubble}><p>{message.deleted ? 'Сообщение удалено' : message.text}</p><time dateTime={message.createdAt}>{showDate ? `${formatDate(message.createdAt)} · ` : ''}{formatTime(message.createdAt)}{message.editedAt && !message.deleted ? ' · изменено' : ''}</time></div>}
    {!message.deleted && message.attachments.map((file) => <AttachmentButton key={file.id} file={file} messageActions={showEditor ? [] : actions} photoLabel={photos.length > 1 ? `Фото ${photos.findIndex((photo) => photo.id === file.id) + 1}` : 'Фото'} />)}
    {!message.text && !message.deleted && !editing && <time className={styles.fileTime} dateTime={message.createdAt}>{showDate ? `${formatDate(message.createdAt)} · ` : ''}{formatTime(message.createdAt)}{message.editedAt ? ' · изменено' : ''}</time>}
    {menu}
  </article>;
}
