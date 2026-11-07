package ru.msrpo.chat.realtime;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import ru.msrpo.chat.auth.ChatPrincipal;

@RestController
@RequiredArgsConstructor
public class EventController {
    private final EventService events;
    @GetMapping(value = "/api/v1/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "SSE: новые сообщения текущего пользователя", description = "Bearer в заголовке. События ready, message.created; соединение закрывается по истечении JWT. После переподключения восстановите историю через afterId.")
    public ResponseEntity<SseEmitter> events(@AuthenticationPrincipal ChatPrincipal viewer) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Accel-Buffering", "no").body(events.subscribe(viewer));
    }
}
