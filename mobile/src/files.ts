import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { assertApiUrl, baseUrl, type ChatApi } from './api';
import type { Attachment, User } from '../../frontend/src/api/contracts';

const rootDirectory = `${FS.cacheDirectory}minechat/`;
const directory = () => `${rootDirectory}${generation}/`;
let generation = 0;
const downloads = new Set<FS.DownloadResumable>();
const pending = new Map<string, Promise<string>>();
export const mediaType = (name: string): 'image' | 'video' | 'audio' | undefined => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['m4a', 'weba', 'ogg', 'mp3', 'wav', 'aac'].includes(ext)) return 'audio';
};
export async function clearFiles() {
  const oldDirectory = directory(); const oldDownloads = [...downloads];
  generation++; pending.clear();
  await Promise.all(oldDownloads.map((download) => download.cancelAsync().catch(() => undefined)));
  oldDownloads.forEach((download) => downloads.delete(download));
  await FS.deleteAsync(oldDirectory, { idempotent: true }).catch(() => undefined);
}
export const initializeFiles = () => FS.deleteAsync(rootDirectory, { idempotent: true }).catch(() => undefined);
export function downloadFile(api: ChatApi, file: Attachment): Promise<string> {
  assertApiUrl();
  if (api.disposed) return Promise.reject(new Error('Сеанс завершён.'));
  const key = `${generation}:${file.id}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const current = generation;
  const targetDirectory = directory();
  const promise = (async () => {
    await FS.makeDirectoryAsync(targetDirectory, { intermediates: true });
    if (current !== generation || api.disposed) throw new Error('Сеанс завершён.');
    const filename = file.filename.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-140) || 'file';
    const uri = `${targetDirectory}${file.id}-${filename}`;
    const download = FS.createDownloadResumable(`${baseUrl}/attachments/${encodeURIComponent(file.id)}`, uri, { headers: { Authorization: `Bearer ${api.token}` } });
    downloads.add(download);
    try {
      const result = await download.downloadAsync();
      if (current !== generation || api.disposed) { await FS.deleteAsync(uri, { idempotent: true }); throw new Error('Сеанс завершён.'); }
      if (!result || result.status !== 200) { await FS.deleteAsync(uri, { idempotent: true }); if (result?.status === 401) api.expire(); throw new Error(result?.status === 401 ? 'Войдите снова: сеанс завершён.' : 'Не удалось скачать вложение.'); }
      return result.uri;
    } finally { downloads.delete(download); }
  })();
  pending.set(key, promise);
  void promise.catch(() => pending.delete(key));
  return promise;
}
export function downloadAvatar(api: ChatApi, user: User): Promise<string> {
  assertApiUrl();
  if (!user.avatarId) return Promise.reject(new Error('Аватар не установлен.'));
  if (api.disposed) return Promise.reject(new Error('Сеанс завершён.'));
  const key = `${generation}:avatar:${user.avatarId}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const current = generation;
  const promise = (async () => {
    const targetDirectory = directory();
    await FS.makeDirectoryAsync(targetDirectory, { intermediates: true });
    if (current !== generation || api.disposed) throw new Error('Сеанс завершён.');
    const temporary = `${targetDirectory}${user.avatarId}.download`;
    const download = FS.createDownloadResumable(`${baseUrl}/users/${encodeURIComponent(user.id)}/avatar`, temporary,
      { headers: { Authorization: `Bearer ${api.token}` } });
    downloads.add(download);
    try {
      const result = await download.downloadAsync();
      if (current !== generation || api.disposed) throw new Error('Сеанс завершён.');
      if (!result || result.status !== 200) {
        if (result?.status === 401) api.expire();
        throw new Error('Не удалось загрузить аватар.');
      }
      const contentType = (result.mimeType || Object.entries(result.headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1])?.split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'image/jpeg' && contentType !== 'image/png') throw new Error('Неподдерживаемый формат аватара.');
      const uri = `${targetDirectory}${user.avatarId}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
      await FS.moveAsync({ from: temporary, to: uri });
      if (current !== generation || api.disposed) { await FS.deleteAsync(uri, { idempotent: true }); throw new Error('Сеанс завершён.'); }
      return uri;
    } catch (error) { await FS.deleteAsync(temporary, { idempotent: true }); throw error; }
    finally { downloads.delete(download); }
  })();
  pending.set(key, promise);
  void promise.catch(() => pending.delete(key));
  return promise;
}
export async function shareFile(api: ChatApi, file: Attachment) {
  if (!await Sharing.isAvailableAsync()) throw new Error('Отправка файлов недоступна на этом устройстве.');
  const uri = await downloadFile(api, file);
  const kind = mediaType(file.filename);
  await Sharing.shareAsync(uri, { dialogTitle: kind === 'image' ? 'Фото' : kind === 'video' ? 'Видео' : file.filename });
}
export async function stageFile(source: string, name: string) {
  const current = generation;
  const targetDirectory = directory();
  await FS.makeDirectoryAsync(targetDirectory, { intermediates: true });
  const uri = `${targetDirectory}picked-${Date.now()}-${Math.random().toString(36).slice(2)}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  await FS.copyAsync({ from: source, to: uri });
  if (FS.cacheDirectory && source.startsWith(FS.cacheDirectory) && !source.startsWith(rootDirectory)) await FS.deleteAsync(source, { idempotent: true });
  if (current !== generation) { await FS.deleteAsync(uri, { idempotent: true }); throw new Error('Сеанс завершён.'); }
  const info = await FS.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || !info.size || info.size > 10 * 1024 * 1024) { await FS.deleteAsync(uri, { idempotent: true }); throw new Error('Выберите непустой файл размером до 10 МиБ.'); }
  return { uri, name, size: info.size };
}
export const discardFile = (uri: string) => FS.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
