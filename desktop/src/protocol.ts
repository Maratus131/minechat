import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const APP_SCHEME = 'minechat';
export const APP_ORIGIN = 'minechat://app';

const csp = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "font-src 'self'", "img-src 'self' blob:", "media-src 'self' blob:",
  "connect-src 'self'", "object-src 'none'", "frame-src 'none'",
  "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');

const securityHeaders = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
};

export function isAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === `${APP_SCHEME}:` && url.hostname === 'app'
      && !url.port && !url.username && !url.password;
  } catch { return false; }
}

export function isAppPage(value: string): boolean {
  if (!isAppUrl(value)) return false;
  return /^\/(?:|login|register|people|profile|chats(?:\/[^/]+)?|channels\/[^/]+|groups\/[^/]+)\/?$/.test(new URL(value).pathname);
}

function problem(status: number, detail: string): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title: 'Запрос не выполнен', status, detail }), {
    status, headers: { ...securityHeaders, 'Content-Type': 'application/problem+json' },
  });
}

function within(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function proxyApi(request: Request, url: URL, upstream: string, lifetime: AbortSignal): Promise<Response> {
  if (!['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return problem(405, 'Этот метод не поддерживается.');
  }
  const headers = new Headers();
  // In particular, do not forward Origin, cookies, Host or proxy headers.
  for (const name of ['authorization', 'content-type', 'accept', 'range']) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set('accept-encoding', 'identity');
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 30_000);
  const signal = AbortSignal.any([request.signal, lifetime, timeout.signal]);
  try {
    const target = new URL(upstream);
    target.pathname = url.pathname;
    target.search = url.search;
    const options: RequestInit & { duplex: 'half' } = {
      method: request.method, headers, signal, redirect: 'manual', credentials: 'omit', duplex: 'half',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') options.body = request.body;
    // Node fetch runs outside the renderer session and does not apply browser CORS.
    const response = await fetch(target, options);
    clearTimeout(timer); // SSE remains open until its consumer cancels or the server closes it.
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      return problem(502, 'Сервер перенаправил запрос. Проверьте адрес backend.');
    }
    const responseHeaders = new Headers(securityHeaders);
    for (const name of ['content-type', 'content-disposition', 'content-range', 'accept-ranges']) {
      const value = response.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }
    // fetch may decode compressed responses; never retain their encoded length.
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return problem(503, 'Нет связи с сервером. Проверьте подключение и адрес backend.');
  } finally { clearTimeout(timer); }
}

export async function createAppHandler(rendererDirectory: string, upstream: string, lifetime: AbortSignal,
  deviceAuth?: (request: Request, action: string) => Promise<Response>) {
  const realtime = new URL('/api/v1/ws', upstream);
  realtime.protocol = realtime.protocol === 'https:' ? 'wss:' : 'ws:';
  const rendererHeaders = { ...securityHeaders, 'Content-Security-Policy': csp.replace("connect-src 'self'", `connect-src 'self' ${realtime.origin}`) };
  const root = await realpath(rendererDirectory);
  await stat(join(root, 'index.html'));
  return async (request: Request): Promise<Response> => {
    if (!isAppUrl(request.url)) return problem(403, 'Этот адрес недоступен.');
    const url = new URL(request.url);
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return problem(400, 'Некорректный путь.'); }
    if (/[\\;\u0000-\u001f\u007f]/.test(pathname) || pathname.includes('//') || /%2f|%5c|%25/i.test(url.pathname)
      || pathname.split('/').some((segment) => segment === '.' || segment === '..')) {
      return problem(400, 'Некорректный путь.');
    }
    if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
      if (pathname === '/api/v1/auth/device' || pathname.startsWith('/api/v1/auth/device/')) return problem(403, 'Этот адрес недоступен.');
      const authAction = /^\/api\/v1\/auth\/(register|login|refresh|logout)$/.exec(pathname)?.[1];
      if (authAction) {
        if (url.search || !deviceAuth) return problem(503, 'Сохранение входа недоступно.');
        return deviceAuth(request, authAction);
      }
      if (pathname === '/api/v1/auth' || pathname.startsWith('/api/v1/auth/')) return problem(403, 'Этот адрес недоступен.');
      return proxyApi(request, url, upstream, lifetime);
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) return problem(404, 'API не найден.');
    if (request.method !== 'GET' && request.method !== 'HEAD') return problem(405, 'Этот метод не поддерживается.');
    const file = resolve(root, `.${pathname}`);
    if (!within(root, file)) return problem(403, 'Этот путь недоступен.');
    try {
      const candidate = isAppPage(request.url) ? join(root, 'index.html') : file;
      const canonical = await realpath(candidate);
      if (!within(root, canonical) || !(await stat(canonical)).isFile()) return problem(404, 'Файл не найден.');
      const contentType = contentTypes[extname(canonical).toLowerCase()];
      if (!contentType) return problem(404, 'Файл не найден.');
      const body = request.method === 'HEAD' ? null : new Uint8Array(await readFile(canonical));
      return new Response(body, { headers: { ...rendererHeaders, 'Content-Type': contentType } });
    } catch { return problem(404, 'Файл не найден.'); }
  };
}
