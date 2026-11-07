import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../features/auth/Session';
import styles from './App.module.css';

export function NavigationMenu() {
  const { signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    function handlePointer(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); trigger.current?.focus(); }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('pointerdown', handlePointer); document.removeEventListener('keydown', handleKey); };
  }, [open]);
  return <div ref={root} className={styles.menuRoot} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className={styles.menuTrigger} aria-label="Меню" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><span aria-hidden="true">☰</span></button>
    {open && <div ref={panel} id={id} className={styles.menuPanel} aria-label="Меню приложения">
      <span className={styles.menuTitle}>MINECHAT</span>
      <Link to="/channels/new" onClick={close}>+ Новый канал</Link>
      <Link to="/groups/new" onClick={close}>+ Новая группа</Link>
      <Link to="/profile" onClick={close}>Профиль и настройки</Link>
      <Link to={`${location.pathname}?search=1`} onClick={close}>Поиск людей и каналов</Link>
      <button onClick={signOut}>Выйти</button>
    </div>}
  </div>;
}

