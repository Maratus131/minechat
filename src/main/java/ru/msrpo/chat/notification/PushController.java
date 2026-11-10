package ru.msrpo.chat.notification;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.msrpo.chat.auth.ChatPrincipal;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class PushController {
    private final PushSubscriptionService subscriptions;
    @GetMapping("/config")
    @Operation(summary = "Публичный ключ Web Push; null, если уведомления на сервере не настроены")
    public PushDtos.ConfigResponse config() { return subscriptions.config(); }
    @PutMapping("/web-push") @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Включить уведомления этого браузера до окончания текущего сеанса")
    public void register(@AuthenticationPrincipal ChatPrincipal viewer, @Valid @RequestBody PushDtos.RegisterRequest body) {
        subscriptions.register(viewer, body);
    }
    @DeleteMapping("/web-push") @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Отключить свою подписку браузера")
    public void remove(@AuthenticationPrincipal ChatPrincipal viewer, @Valid @RequestBody PushDtos.RemoveRequest body) {
        subscriptions.remove(viewer.id(), body.endpoint());
    }
}
