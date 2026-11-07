import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export async function backendOrigin(configDirectory: string, packaged: boolean): Promise<string> {
  let configured = process.env.MSRPO_BACKEND_URL;
  if (!configured) {
    try {
      const environment = parseEnv(await readFile(join(configDirectory, packaged ? 'config.env' : '.env'), 'utf8'));
      configured = environment.MSRPO_BACKEND_URL;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  const url = new URL(configured || 'http://localhost:8080');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MSRPO_BACKEND_URL: укажите HTTPS origin без пути и учётных данных. HTTP доступен только для localhost, 127.0.0.1 или [::1].');
  }
  return url.origin;
}
