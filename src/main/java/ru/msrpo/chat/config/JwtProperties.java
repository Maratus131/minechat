package ru.msrpo.chat.config;

import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import java.time.Duration;

@Validated
@ConfigurationProperties("app.jwt")
public record JwtProperties(@NotBlank String secret, @NotBlank String issuer, @NotNull Duration accessTtl) {
    public JwtProperties {
        if (accessTtl != null && (accessTtl.isZero() || accessTtl.isNegative() || accessTtl.compareTo(Duration.ofDays(1)) > 0))
            throw new IllegalArgumentException("app.jwt.access-ttl must be positive and at most 1 day");
    }
    @Override public String toString() { return "JwtProperties[secret=REDACTED, issuer=" + issuer + ", accessTtl=" + accessTtl + "]"; }
}
