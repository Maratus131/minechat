type IconName = 'menu' | 'create' | 'search' | 'close' | 'attach' | 'mic' | 'send' | 'back' | 'more' | 'people' | 'chats' | 'profile' | 'channel';

const paths: Record<IconName, string> = {
  menu: 'M4 6h16M4 12h16M4 18h16',
  create: 'm14 5 5 5M4 20l5-1L21 7l-5-5L4 14v6Z',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  close: 'm6 6 12 12M6 18 18 6',
  attach: 'm8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2',
  mic: 'M9 4h6v10H9V4ZM5 11v3a7 7 0 0 0 14 0v-3M12 21v-2',
  send: 'm3 3 19 9-19 9 4-9-4-9ZM7 12h15',
  back: 'm14 5-7 7 7 7',
  more: 'M4 12h2M11 12h2M18 12h2',
  people: 'M9 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM2 21v-5a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v5M17 4a3 3 0 0 1 0 6M19 13a5 5 0 0 1 3 5v3',
  chats: 'M3 3h18v14H9l-6 4V3Z',
  profile: 'M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM4 21v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3',
  channel: 'M3 9h5l11-5v16L8 15H3V9ZM8 15l2 6h4l-2-5M22 9v6',
};

export function Icon({ name }: { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
