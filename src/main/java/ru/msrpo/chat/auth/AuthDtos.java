package ru.msrpo.chat.auth;

import jakarta.validation.constraints.*;
import ru.msrpo.chat.user.UserResponse;

public final class AuthDtos {
    private AuthDtos() {}
    public record RegisterRequest(@NotBlank @Pattern(regexp = "[a-zA-Z0-9_]{3,32}") String username,
            @NotBlank @Size(max = 80) @Pattern(regexp = "[^\\x00]*") String displayName,
            @NotBlank @Size(min = 8, max = 72) String password) {}
    public record LoginRequest(@NotBlank @Size(max = 32) String username, @NotBlank @Size(max = 72) String password) {}
    public record AuthResponse(String accessToken, String tokenType, long expiresIn, UserResponse user) {}
    public record RefreshRequest(@NotBlank @Size(max = 128) String refreshToken) {
        @Override public String toString() { return "RefreshRequest[token=REDACTED]"; }
    }
    public record DeviceAuthResponse(String accessToken, String tokenType, long expiresIn, UserResponse user,
                                     String refreshToken, long refreshExpiresIn) {
        @Override public String toString() { return "DeviceAuthResponse[credentials=REDACTED]"; }
    }
}
