import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSession } from './session';
import { errorMessage } from './api';
import { Button, Field, Label, Notice, s } from './ui';
import { MessageItem } from './MessageItem';

export function SearchMessages({ id }: { id: string }) {
  const { api } = useSession(); const [text, setText] = useState(''); const [term, setTerm] = useState('');
  const query = useInfiniteQuery({ queryKey: ['message-search', id, term], initialPageParam: 0, enabled: !!term,
    queryFn: ({ pageParam, signal }) => api.search(id, term, pageParam, signal),
    getNextPageParam: (page, pages) => page.hasMore && pages.length < 50 ? pages.length : undefined });
  const messages = [...new Map(query.data?.pages.flatMap((page) => page.items).map((message) => [message.id, message])).values()];
  return <View style={s.fill}><View style={s.content}><Field label="Поиск в переписке" value={text} onChangeText={setText} maxLength={200} autoFocus />
    <Button title="Найти" disabled={!text.trim() || query.isFetching} onPress={() => { if (term === text.trim()) void query.refetch(); else setTerm(text.trim()); }} />
    <Label>Новые сообщения появляются в поиске с задержкой.</Label>
    {!!term && query.isPending && <Label>Поиск…</Label>}
    {query.error && <><Notice text={errorMessage(query.error)} /><Button title="Повторить" onPress={() => { void query.refetch(); }} /></>}
  </View><FlatList data={messages} keyExtractor={(message) => String(message.id)} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <MessageItem message={item} />}
    ListEmptyComponent={query.isSuccess ? <Label>Сообщения не найдены.</Label> : null}
    ListFooterComponent={<View style={s.content}>{query.hasNextPage && <Button title="Ещё результаты" disabled={query.isFetchingNextPage} onPress={() => { void query.fetchNextPage(); }} />}{messages.length >= 1000 && <Label>Показаны первые 1000 результатов. Уточните запрос.</Label>}</View>} />
  </View>;
}
