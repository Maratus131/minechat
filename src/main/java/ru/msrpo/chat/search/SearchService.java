package ru.msrpo.chat.search;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.elasticsearch.client.elc.NativeQuery;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.common.*;
import ru.msrpo.chat.conversation.ConversationService;
import ru.msrpo.chat.message.*;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SearchService {
    private final ConversationService conversations;
    private final ElasticsearchOperations elasticsearch;
    private final MessageRepository messages;
    private final MessageService messageService;

    @Transactional(readOnly = true)
    public ItemsResponse<MessageResponse> search(UUID dialog, UUID viewer, String text, int page, int limit) {
        conversations.requireMember(dialog, viewer);
        ItemsResponse.validateLimit(limit);
        if (text.isBlank() || text.length() > 200) throw ApiException.badRequest("Поисковая строка: от 1 до 200 символов");
        if (page < 0 || (long) (page + 1) * limit > 1000) throw ApiException.badRequest("Поиск ограничен первыми 1000 результатами");
        var query = NativeQuery.builder().withQuery(q -> q.bool(b -> b
                .filter(f -> f.term(t -> t.field("conversationId").value(dialog.toString())))
                .must(m -> m.match(t -> t.field("text").query(text)))))
            .withSort(s -> s.score(score -> score.order(co.elastic.clients.elasticsearch._types.SortOrder.Desc)))
            .withSort(s -> s.field(field -> field.field("messageId").order(co.elastic.clients.elasticsearch._types.SortOrder.Desc)))
            .withPageable(PageRequest.of(page, limit)).build();
        final List<Long> ids;
        final boolean hasMore;
        try {
            var hits = elasticsearch.search(query, MessageDocument.class);
            ids = hits.stream().map(hit -> Long.parseLong(hit.getContent().id())).toList();
            hasMore = hits.getTotalHits() > (long) (page + 1) * limit;
        } catch (RuntimeException error) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Поиск временно недоступен. Сообщения продолжают сохраняться.");
        }
        // Never return document contents directly: PostgreSQL remains the authority for dialog membership and data.
        var found = messages.findByConversationIdAndIdIn(dialog, ids).stream().collect(Collectors.toMap(Message::getId, m -> m));
        var ordered = ids.stream().map(found::get).filter(Objects::nonNull).filter(message -> !message.isDeleted()).toList();
        return new ItemsResponse<>(messageService.toResponses(ordered), hasMore);
    }
}
