package ru.msrpo.chat.conversation;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ItemsResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {
    private final ConversationService conversations;
    private final PresenceService presence;
    public record OpenConversationRequest(@NotNull UUID userId) {}
    @PostMapping @Operation(summary = "Открыть личный диалог; повторный запрос возвращает существующий")
    public ConversationResponse open(@AuthenticationPrincipal ChatPrincipal viewer, @Valid @RequestBody OpenConversationRequest request) {
        return conversations.open(viewer.id(), request.userId());
    }
    @GetMapping @Operation(summary = "Мои диалоги, сначала недавно активные")
    public ItemsResponse<ConversationResponse> list(@AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int limit) {
        return conversations.list(viewer.id(), page, limit);
    }

    @GetMapping("/{id}/presence")
    @Operation(summary = "Статус соединения собеседника в личном диалоге",
        description = "online=true, пока есть хотя бы одно неистёкшее SSE-подключение. Только для участника личного диалога; чужой диалог, группа или канал возвращают 404. Время последнего посещения не сохраняется.")
    public ResponseEntity<PresenceResponse> presence(@PathVariable UUID id, @AuthenticationPrincipal ChatPrincipal viewer) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(presence.peer(id, viewer.id()));
    }
}
