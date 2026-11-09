import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from './session';
import { errorMessage } from './api';
import { Button, Field, Label, Notice, s } from './ui';
import { MessageItem } from './MessageItem';
import type { Message } from '../../frontend/src/api/contracts';
import { historyKey, mergeMessages, type History } from './history';

export function SearchMessages({ id, canEdit, canDelete, deleting, onDelete }: { id: string; canEdit: (message: Message) => boolean; canDelete: (message: Message) => boolean; deleting: boolean; onDelete: (messageId: number) => void }) {
  const { api } = useSession(); const [text, setText] = useState(''); const [term, setTerm] = useState('');
  const cache = useQueryClient();
  const query = useInfiniteQuery({ queryKey: ['message-search', id, term], initialPageParam: 0, enabled: !!term,
    queryFn: async ({ pageParam, signal }) => {
      const page = await api.search(id, term, pageParam, signal);
      const current = new Map(cache.getQueryData<History>(historyKey(id))?.items.map((message) => [message.id, message]));
      return { ...page, items: page.items.map((message) => {
        const known = current.get(message.id);
        return known ? mergeMessages([message], [known])[0]! : message;
      }).filter((message) => !message.deleted) };
    },
    getNextPageParam: (page, pages) => page.hasMore && pages.length < 50 ? pages.length : undefined });
  const messages = [...new Map(query.data?.pages.flatMap((page) => page.items).map((message) => [message.id, message])).values()];
  return <View style={s.fill}><View style={s.content}><Field label="Поиск в переписке" value={text} onChangeText={setText} maxLength={200} autoFocus />
    <Button title="Найти" disabled={!text.trim() || query.isFetching} onPress={() => { if (term === text.trim()) void query.refetch(); else setTerm(text.trim()); }} />
    <Label>Новые сообщения появляются в поиске с задержкой.</Label>
    {!!term && query.isPending && <Label>Поиск…</Label>}
    {query.error && <><Notice text={errorMessage(query.error)} /><Button title="Повторить" onPress={() => { void query.refetch(); }} /></>}
  </View><FlatList data={messages} keyExtractor={(message) => String(message.id)} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <MessageItem message={item} canEdit={canEdit(item)} canDelete={canDelete(item)} deleting={deleting} onDelete={() => onDelete(item.id)} />}
    ListEmptyComponent={query.isSuccess ? <Label>Сообщения не найдены.</Label> : null}
    ListFooterComponent={<View style={s.content}>{query.hasNextPage && <Button title="Ещё результаты" disabled={query.isFetchingNextPage} onPress={() => { void query.fetchNextPage(); }} />}{messages.length >= 1000 && <Label>Показаны первые 1000 результатов. Уточните запрос.</Label>}</View>} />
  </View>;
}
