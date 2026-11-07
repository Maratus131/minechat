export function combineAbortSignals(first: AbortSignal, second: AbortSignal) {
  const controller = new AbortController();
  const cleanup = () => {
    first.removeEventListener('abort', abort);
    second.removeEventListener('abort', abort);
  };
  const abort = () => {
    controller.abort();
    cleanup();
  };

  if (first.aborted || second.aborted) abort();
  else {
    first.addEventListener('abort', abort, { once: true });
    second.addEventListener('abort', abort, { once: true });
  }

  return { signal: controller.signal, cleanup };
}
