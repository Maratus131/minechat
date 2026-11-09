import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './messages.module.css';

export interface MessageAction { label: string; run: () => void; disabled?: boolean }

export function useMessageMenu(actions: MessageAction[]) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  function cancelPress() { if (press.current) clearTimeout(press.current.timer); press.current = null; }
  useEffect(() => {
    window.addEventListener('scroll', cancelPress, true);
    return () => { cancelPress(); window.removeEventListener('scroll', cancelPress, true); };
  }, []);
  function open(target: HTMLElement, x: number, y: number) {
    if (!actions.length) return;
    cancelPress(); origin.current = target; setPosition({ x, y });
  }
  function close() { setPosition(null); origin.current?.focus({ preventScroll: true }); }
  const handlers = {
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      if (!actions.length) return;
      event.preventDefault(); event.stopPropagation(); open(event.currentTarget, event.clientX, event.clientY);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault(); event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect(); open(event.currentTarget, rect.left, rect.bottom);
      }
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (!event.isPrimary) { cancelPress(); return; }
      if (event.pointerType !== 'touch' || !actions.length) return;
      event.stopPropagation(); cancelPress();
      const target = event.currentTarget;
      const { clientX: x, clientY: y } = event;
      press.current = { x, y, timer: setTimeout(() => open(target, x, y), 500) };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 10) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
  };
  return { handlers, menu: position && actions.length > 0 && <ContextMenu position={position} actions={actions} onClose={close} /> };
}

function ContextMenu({ position, actions, onClose }: { position: { x: number; y: number }; actions: MessageAction[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(position);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setOffset({ x: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)) });
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [position]);
  useEffect(() => {
    function outside(event: Event) { if (!menu.current?.contains(event.target as Node)) onClose(); }
    function escape(event: globalThis.KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', onClose); window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);
  function handleKey(event: KeyboardEvent) {
    const items = [...menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') onClose();
  }
  return createPortal(<div ref={menu} role="menu" aria-label="Действия с сообщением" className={styles.contextMenu} style={{ left: offset.x, top: offset.y }} onKeyDown={handleKey}>
    {actions.map((action) => <button key={action.label} role="menuitem" disabled={action.disabled} onClick={() => { onClose(); action.run(); }}>{action.label}</button>)}
  </div>, document.body);
}
