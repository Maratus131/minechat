package ru.msrpo.chat.notification;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class PushDtos {
    private PushDtos() {}
    public record ConfigResponse(String webPushPublicKey) {}
    public record Keys(@NotBlank @Size(max = 100) String p256dh, @NotBlank @Size(max = 32) String auth) {}
    public record RegisterRequest(@NotBlank @Size(max = 2048) String endpoint, @NotNull @Valid Keys keys) {}
    public record RemoveRequest(@NotBlank @Size(max = 2048) String endpoint) {}
}
