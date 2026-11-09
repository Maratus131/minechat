import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

try {
  await writeFile(new URL('.env', import.meta.url),
    `LOAD_DB_PASSWORD=${randomBytes(24).toString('hex')}\nLOAD_JWT_SECRET=${randomBytes(48).toString('base64')}\n`, { flag: 'wx' });
  console.log('Создан loadtests/.env для отдельного нагрузочного стенда.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('loadtests/.env уже существует, настройки сохранены.');
}
