package ru.msrpo.chat.message;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ItemsResponse;
import java.util.*;

@RestController
@RequestMapping("/api/v1/conversations/{conversationId}/messages")
@RequiredArgsConstructor
public class MessageController {
    private final MessageService messages;
    public record TextRequest(@Size(max = 4096) String text) {}
    public record EditRequest(@NotNull @Size(max = 4096) String text) {}

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE) @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Отправить текстовое сообщение",
        description = "В личном диалоге пишет участник; в группе — все, кроме читателя; в канале — владелец и администраторы.")
    public MessageResponse sendText(@PathVariable UUID conversationId, @AuthenticationPrincipal ChatPrincipal viewer,
            @Valid @RequestBody TextRequest request) {
        return messages.send(conversationId, viewer.id(), request.text(), List.of());
    }
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE) @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Отправить сообщение с файлами", description = "Права такие же, как у текстового сообщения. Поля: text (необязательное), files (до 5 файлов по 10 МБ). Допускается сообщение только с файлами.")
    public MessageResponse sendFiles(@PathVariable UUID conversationId, @AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam(required = false) String text, @RequestPart(required = false) List<MultipartFile> files) {
        return messages.send(conversationId, viewer.id(), text, files);
    }
    @GetMapping @Operation(summary = "История: новые сначала; с afterId — по возрастанию ID", description = "Личный диалог и группа доступны участникам; публичный канал — всем авторизованным пользователям. beforeId — старые сообщения; afterId — восстановление после разрыва соединения. Удалённые сообщения возвращаются заглушками.")
    public ItemsResponse<MessageResponse> history(@PathVariable UUID conversationId, @AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam(required = false) Long beforeId, @RequestParam(required = false) Long afterId,
            @RequestParam(defaultValue = "50") int limit) {
        return messages.history(conversationId, viewer.id(), beforeId, afterId, limit);
    }
    @PutMapping("/{messageId}")
    @Operation(summary = "Изменить своё сообщение или подпись без замены вложений",
        description = "Нужно оставаться участником с правом отправки. Даже администратор не редактирует чужие сообщения. Удалённое сообщение возвращает 409. Пустой текст разрешён только при наличии вложений. Ограничения по времени нет.")
    public MessageResponse edit(@PathVariable UUID conversationId, @PathVariable long messageId,
            @AuthenticationPrincipal ChatPrincipal viewer, @Valid @RequestBody EditRequest request) {
        return messages.edit(conversationId, messageId, viewer.id(), request.text());
    }
    @DeleteMapping("/{messageId}") @Operation(summary = "Удалить сообщение по правам переписки")
    public MessageResponse delete(@PathVariable UUID conversationId, @PathVariable long messageId,
            @AuthenticationPrincipal ChatPrincipal viewer) {
        return messages.delete(conversationId, messageId, viewer.id());
    }
}
