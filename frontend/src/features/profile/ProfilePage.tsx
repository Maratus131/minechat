import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile } from '../../api/contracts';
import { ErrorNotice } from '../../shared/ui';
import { useAuth, useSession } from '../auth/Session';
import { UserAvatar } from './UserAvatar';
import { NotificationSettings } from '../notifications/Notifications';
import styles from './ProfilePage.module.css';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function ProfilePage() {
  const { api } = useSession();
  const { signOut } = useAuth();
  const profile = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => api.me(signal) });
  return <section className={styles.page} aria-labelledby="profile-title">
    <header><h1 id="profile-title">Профиль и настройки</h1></header>
    <div className={styles.body}>
      {profile.isPending && <p role="status">Загрузка профиля…</p>}
      {profile.isError && <ErrorNotice error={profile.error} retry={() => void profile.refetch()} />}
      {profile.data && <ProfileEditor profile={profile.data} />}
      <NotificationSettings />
      <h2 className={styles.section}>Сеанс</h2>
      <p>Вход действует до завершения сеанса или перезагрузки страницы.</p>
      <button onClick={signOut}>Выйти из аккаунта</button>
    </div>
  </section>;
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const { api } = useSession();
  const { updateUser } = useAuth();
  const cache = useQueryClient();
  const [name, setName] = useState(profile.displayName);
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '');
  const [fileError, setFileError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  function accept(next: Profile, message: string, syncFields = false) {
    cache.setQueryData(['me'], next);
    updateUser(next);
    if (syncFields) {
      setName(next.displayName);
      setBirthDate(next.birthDate ?? '');
    }
    setNotice(message);
    for (const key of ['conversations', 'conversation', 'channels', 'channel', 'channel-search', 'users', 'history', 'message-search']) {
      void cache.invalidateQueries({ queryKey: [key] });
    }
  }

  const save = useMutation({ mutationFn: () => api.updateProfile(name.trim(), birthDate || null), onSuccess: (next) => accept(next, 'Профиль сохранён.', true) });
  const upload = useMutation({ mutationFn: (file: File) => api.uploadAvatar(file), onSuccess: (next) => accept(next, 'Фото профиля обновлено.') });
  const remove = useMutation({ mutationFn: () => api.deleteAvatar(), onSuccess: (next) => accept(next, 'Фото профиля удалено.') });
  const busy = save.isPending || upload.isPending || remove.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    if (!name.trim() || name.trim().length > 80) { setFileError('Введите имя длиной от 1 до 80 символов.'); return; }
    setFileError('');
    save.mutate();
  }
  function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice('');
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setFileError('Выберите фото JPEG или PNG.'); return; }
    if (file.size === 0 || file.size > MAX_AVATAR_BYTES) { setFileError('Размер фото должен быть не больше 5 МиБ.'); return; }
    setFileError('');
    upload.mutate(file);
  }

  return <>
    <div className={styles.identity}>
      <div className={styles.picture}><UserAvatar user={profile} /></div>
      <div><h2>{profile.displayName}</h2><p>@{profile.username}</p></div>
    </div>
    <div className={styles.avatarActions}>
      <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>Изменить фото</button>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png" onChange={handleAvatar} disabled={busy} hidden tabIndex={-1} aria-hidden="true" />
      {profile.avatarId && <button type="button" disabled={busy} onClick={() => { setNotice(''); remove.mutate(); }}>Удалить фото</button>}
    </div>
    <p>JPEG/PNG до 5 МиБ. Большие фото уменьшаются автоматически.</p>
    <form className={styles.form} onSubmit={handleSubmit}>
      <label>Отображаемое имя<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={busy} /></label>
      <label>Дата рождения<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={new Date().toISOString().slice(0, 10)} disabled={busy} /></label>
      <p>Дату рождения видите только вы.</p>
      <button className="primary" type="submit" disabled={busy || (!name.trim())}>{save.isPending ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
    {fileError && <p className={styles.error} role="alert">{fileError}</p>}
    {save.isError && <ErrorNotice error={save.error} />}
    {upload.isError && <ErrorNotice error={upload.error} />}
    {remove.isError && <ErrorNotice error={remove.error} />}
    {notice && <p className={styles.success} role="status">{notice}</p>}
  </>;
}
