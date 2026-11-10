package ru.msrpo.chat.config;

import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import java.time.Duration;

@Validated
@ConfigurationProperties("app.auth")
public record AuthSessionProperties(@NotNull Duration sessionTtl, boolean cookieSecure) {
    public AuthSessionProperties {
        if (sessionTtl != null && (sessionTtl.isZero() || sessionTtl.isNegative() || sessionTtl.compareTo(Duration.ofDays(90)) > 0))
            throw new IllegalArgumentException("app.auth.session-ttl must be positive and at most 90 days");
    }
}
