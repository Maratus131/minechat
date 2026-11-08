import type { Message } from '../../api/contracts';
import { formatDate, formatTime } from '../../shared/ui';
import { Icon } from '../../shared/Icon';
import { AttachmentButton } from './AttachmentButton';
import { UserAvatar } from '../profile/UserAvatar';
import styles from './messages.module.css';

export function MessageItem({ message, mine, showDate = false, onDelete, deleting = false }: { message: Message; mine: boolean; showDate?: boolean; onDelete?: () => void; deleting?: boolean }) {
  return <article className={`${styles.message} ${mine ? styles.mine : ''}`} aria-label={`${mine ? 'Вы' : message.sender.displayName}, ${formatTime(message.createdAt)}`}>
    <UserAvatar user={message.sender} />
    {(message.text || message.deleted) && <div className={styles.bubble}><p>{message.deleted ? 'Сообщение удалено' : message.text}</p><time dateTime={message.createdAt}>{showDate ? `${formatDate(message.createdAt)} · ` : ''}{formatTime(message.createdAt)}</time></div>}
    {!message.deleted && message.attachments.map((file) => <AttachmentButton key={file.id} file={file} />)}
    {!message.text && !message.deleted && <time className={styles.fileTime} dateTime={message.createdAt}>{showDate ? `${formatDate(message.createdAt)} · ` : ''}{formatTime(message.createdAt)}</time>}
    {onDelete && <details className={styles.messageActions}><summary aria-label="Действия с сообщением" title="Действия с сообщением"><Icon name="more" /></summary><button type="button" disabled={deleting} onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onDelete(); }}>{deleting ? 'Удаляем…' : 'Удалить сообщение'}</button></details>}
  </article>;
}
