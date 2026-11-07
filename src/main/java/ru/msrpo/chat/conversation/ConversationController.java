package ru.msrpo.chat.conversation;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
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
}
