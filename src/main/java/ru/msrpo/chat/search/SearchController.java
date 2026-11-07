package ru.msrpo.chat.search;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ItemsResponse;
import ru.msrpo.chat.message.MessageResponse;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class SearchController {
    private final SearchService search;
    @GetMapping("/api/v1/conversations/{id}/messages/search")
    @Operation(summary = "Поиск текста в диалоге или публичном канале", description = "Личный диалог доступен участникам; публичный канал — всем авторизованным пользователям. Elasticsearch, индексация с небольшой задержкой. Содержимое файлов не индексируется.")
    public ItemsResponse<MessageResponse> search(@PathVariable UUID id, @AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam String q, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int limit) {
        return search.search(id, viewer.id(), q, page, limit);
    }
}
