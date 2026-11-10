import type { SessionVault } from './session-vault.js';

function problem(status: number, detail: string) {
  return new Response(JSON.stringify({ title: 'Запрос не выполнен', status, detail }), {
    status, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
  });
}

/** Only main sees device refresh credentials; the renderer keeps using the ordinary four auth routes. */
export function deviceAuthProxy(upstream: string, vault: SessionVault, lifetime: AbortSignal) {
  let pending: Promise<unknown> = Promise.resolve();
  async function execute(request: Request, action: string): Promise<Response> {
    if (request.method !== 'POST') return problem(405, 'Этот метод не поддерживается.');
    const signal = AbortSignal.any([request.signal, lifetime, AbortSignal.timeout(action === 'logout' ? 5000 : 10_000)]);
    try {
      let body: unknown;
      if (action === 'login' || action === 'register') {
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 16_384) return problem(400, 'Слишком большой запрос.');
        body = JSON.parse(Buffer.from(bytes).toString('utf8'));
      } else {
        const refreshToken = await vault.get();
        if (action === 'logout') await vault.clear();
        if (!refreshToken) return action === 'logout' ? new Response(null, { status: 204 }) : problem(401, 'Войдите в аккаунт.');
        body = { refreshToken };
      }
      const response = await fetch(new URL(`/api/v1/auth/device/${action}`, upstream), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal, redirect: 'error', credentials: 'omit',
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (action === 'refresh' && response.status === 401) await vault.clear();
        return problem(response.status, action === 'register' && response.status === 409 ? 'Логин уже занят.' : response.status === 401 ? 'Проверьте логин и пароль или войдите снова.' : 'Не удалось выполнить запрос. Повторите попытку.');
      }
      if (action === 'logout') { await response.body?.cancel(); return new Response(null, { status: 204 }); }
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('refreshToken' in result) || typeof result.refreshToken !== 'string'
        || !('refreshExpiresIn' in result) || typeof result.refreshExpiresIn !== 'number' || !('accessToken' in result)
        || typeof result.accessToken !== 'string' || !('tokenType' in result) || result.tokenType !== 'Bearer'
        || !('expiresIn' in result) || typeof result.expiresIn !== 'number' || !('user' in result)) {
        return problem(502, 'Сервер вернул некорректный ответ входа.');
      }
      signal.throwIfAborted();
      await vault.save(result.refreshToken, result.refreshExpiresIn);
      return new Response(JSON.stringify({ accessToken: result.accessToken, tokenType: result.tokenType, expiresIn: result.expiresIn, user: result.user }), {
        status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      return problem(error instanceof SyntaxError ? 400 : 503, error instanceof SyntaxError ? 'Некорректный запрос.' : 'Нет связи с сервером. Сохранённый вход не удалён.');
    }
  }
  return (request: Request, action: string): Promise<Response> => {
    const response = pending.catch(() => {}).then(() => execute(request, action));
    pending = response;
    return response;
  };
}
