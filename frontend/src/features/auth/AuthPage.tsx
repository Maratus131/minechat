import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { ChatApi, errorMessage } from '../../api/client';
import { Brand } from '../../shared/ui';
import { useAuth } from './Session';
import { validateCredentials } from './validation';
import styles from './AuthPage.module.css';

export function AuthPage({ register = false }: { register?: boolean }) {
  const { session, signIn, prepareSignIn, notice } = useAuth();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  if (session) return <Navigate to="/chats" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const credentials = { username: String(form.get('username') ?? '').trim(), password: String(form.get('password') ?? '') };
    const data = register ? { ...credentials, displayName: String(form.get('displayName') ?? '').trim() } : credentials;
    const validation = validateCredentials(data);
    if (validation) { setError(validation); return; }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    const api = new ChatApi();
    try {
      await prepareSignIn();
      controller.signal.throwIfAborted();
      const response = 'displayName' in data ? await api.register(data, controller.signal) : await api.login(data, controller.signal);
      if (!controller.signal.aborted) signIn(response);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <main className={styles.page}>
    <Link to="/login" className={styles.brandLink} aria-label="Minechat, вход"><Brand /></Link>
    <section className={styles.panel} aria-labelledby="auth-title">
      <h1 id="auth-title">{register ? 'Новый игрок' : 'Вход в чат'}</h1>
      <p className={styles.intro}>{register ? 'Создайте аккаунт и начните личную переписку.' : 'Ваши друзья и разговоры ждут вас.'}</p>
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <form onSubmit={handleSubmit} className={styles.form}>
        <label>Логин<input name="username" autoComplete="username" required maxLength={32} autoCapitalize="none" spellCheck={false} placeholder="например, alex" /></label>
        {register && <label>Имя<input name="displayName" autoComplete="nickname" maxLength={80} required placeholder="Как вас называть" /></label>}
        <label>Пароль<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required aria-describedby={register ? 'password-hint' : undefined} /></label>
        {register && <p className={styles.hint} id="password-hint">От 8 символов, до 72 байт UTF-8.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className="primary" disabled={pending} type="submit">{pending ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
      <p className={styles.switch}>{register ? 'Уже есть аккаунт?' : 'Впервые здесь?'} <Link to={register ? '/login' : '/register'}>{register ? 'Войти' : 'Зарегистрироваться'}</Link></p>
    </section>
    <p className={styles.footnote}>Личные сообщения · Текст и файлы</p>
  </main>;
}
