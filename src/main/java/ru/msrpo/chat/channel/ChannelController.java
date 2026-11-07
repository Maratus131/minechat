package ru.msrpo.chat.channel;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ItemsResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/channels")
@RequiredArgsConstructor
public class ChannelController {
    private final ChannelService channels;

    @GetMapping
    @Operation(summary = "Мои подписки на публичные каналы, сначала недавно активные")
    public ItemsResponse<ChannelResponse> list(@AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int limit) {
        return channels.list(viewer.id(), page, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Создать публичный канал и подписать владельца",
        description = "Уникальный username: 3–32 латинских буквы, цифры или _, регистр не учитывается. Заголовок: 1–80 символов, описание: до 500. Занятое имя возвращает 409.")
    public ChannelResponse create(@AuthenticationPrincipal ChatPrincipal viewer,
            @Valid @RequestBody CreateChannelRequest request) {
        return channels.create(viewer.id(), request);
    }

    @GetMapping("/search")
    @Operation(summary = "Найти публичные каналы по имени или заголовку",
        description = "q: от 2 до 100 символов. Все каналы доступны авторизованным пользователям, включая каналы без подписки.")
    public ItemsResponse<ChannelResponse> search(@AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam String q, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "30") int limit) {
        return channels.search(viewer.id(), q, page, limit);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Информация о публичном канале",
        description = "История, публикация и поиск сообщений используют /conversations/{id}/messages. Читать могут все авторизованные пользователи, публиковать — владелец и администраторы.")
    public ChannelResponse get(@AuthenticationPrincipal ChatPrincipal viewer, @PathVariable UUID id) {
        return channels.get(id, viewer.id());
    }

    @PostMapping("/{id}/subscription")
    @Operation(summary = "Подписаться на канал; повторная подписка возвращает текущее состояние")
    public ChannelResponse subscribe(@AuthenticationPrincipal ChatPrincipal viewer, @PathVariable UUID id) {
        return channels.subscribe(id, viewer.id());
    }

    @DeleteMapping("/{id}/subscription")
    @Operation(summary = "Отписаться от канала; повторная отписка возвращает текущее состояние",
        description = "Владелец не может отписаться: 403. Ответ 200 содержит обновлённый канал.")
    public ChannelResponse unsubscribe(@AuthenticationPrincipal ChatPrincipal viewer, @PathVariable UUID id) {
        return channels.unsubscribe(id, viewer.id());
    }

    @GetMapping("/{id}/members") @Operation(summary = "Подписчики и роли канала")
    public ItemsResponse<ChannelMemberResponse> members(@AuthenticationPrincipal ChatPrincipal viewer, @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "100") int limit) {
        return channels.listMembers(id, viewer.id(), page, limit);
    }

    @PutMapping("/{id}/members/{userId}") @Operation(summary = "Назначить или снять администратора канала")
    public ChannelMemberResponse changeRole(@AuthenticationPrincipal ChatPrincipal viewer, @PathVariable UUID id,
            @PathVariable UUID userId, @Valid @RequestBody ChangeChannelRoleRequest request) {
        return channels.changeRole(id, viewer.id(), userId, request);
    }
}
