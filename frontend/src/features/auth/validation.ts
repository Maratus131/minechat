import type { Credentials, Registration } from '../../api/contracts';

export function validateCredentials(value: Credentials | Registration): string | undefined {
  if (!value.username.trim() || !value.password) return 'Введите логин и пароль.';
  if (value.username.length > 32) return 'Логин должен содержать не более 32 символов.';
  if (new TextEncoder().encode(value.password).length > 72) return 'Пароль должен занимать не более 72 байт UTF-8. Сократите его.';
  if ('displayName' in value) {
    if (!/^[a-zA-Z0-9_]{3,32}$/.test(value.username)) return 'Логин: от 3 до 32 латинских букв, цифр или знаков _.';
    if (!value.displayName.trim() || value.displayName.length > 80 || value.displayName.includes('\0')) return 'Введите имя длиной от 1 до 80 символов.';
    if (value.password.length < 8) return 'Пароль должен содержать не менее 8 символов.';
  }
}
