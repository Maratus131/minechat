import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === '../auth/Session') return { url: 'data:text/javascript,export function useSession(){}', shortCircuit: true };
  try { return next(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && context.parentURL?.includes('/src/')) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { mergeMessages, recoverHistory, historyKey, acceptMessage } = await import('../src/features/messages/history.ts');
const original = { id: 1, conversationId: 'chat', text: 'old', createdAt: '2026-11-08T00:00:00Z', editedAt: null, attachments: [], deleted: false };
const edited = { ...original, text: 'new', editedAt: '2026-11-09T00:00:00Z' };

test('Stale REST snapshots cannot overwrite an edit or resurrect a deleted message', () => {
  assert.equal(mergeMessages([edited], [original])[0].text, 'new');
  assert.equal(mergeMessages([original], [edited])[0].text, 'new');
  const deleted = { ...edited, text: '', deleted: true };
  assert.equal(mergeMessages([deleted], [edited])[0].deleted, true);
  assert.equal(mergeMessages([edited], [deleted])[0].deleted, true);
});

test('Recovery re-reads every cached page, including edits older than the afterId cursor', async () => {
  const cache = new QueryClient();
  cache.setQueryData(historyKey('chat'), { items: [original, { ...original, id: 3 }], hasMore: true, syncedThrough: 3 });
  const calls = [];
  const api = { async history(id, cursor) {
    assert.equal(id, 'chat'); calls.push(cursor);
    if (cursor.afterId === 3) return { items: [], hasMore: false };
    if (cursor.beforeId === 3) return { items: [edited, { ...original, id: 2 }], hasMore: true };
    return { items: [{ ...original, id: 3 }], hasMore: true };
  } };
  await recoverHistory(cache, api, 'chat', new AbortController().signal);
  assert.deepEqual(calls, [{ afterId: 3 }, {}, { beforeId: 3 }]);
  assert.equal(cache.getQueryData(historyKey('chat')).items[0].text, 'new');
  cache.clear();
});

test('An edit updates history by ID and invalidates cached search results', () => {
  const cache = new QueryClient();
  cache.setQueryData(historyKey('chat'), { items: [original], hasMore: false, syncedThrough: 1 });
  cache.setQueryData(['message-search', 'chat', 'old'], { pages: [{ items: [original], hasMore: false }], pageParams: [0] });
  acceptMessage(cache, edited);
  assert.equal(cache.getQueryData(historyKey('chat')).items[0].text, 'new');
  assert.equal(cache.getQueryData(['message-search', 'chat', 'old']).pages[0].items[0].text, 'new');
  assert.equal(cache.getQueryState(['message-search', 'chat', 'old']).isInvalidated, true);
  cache.clear();
});
