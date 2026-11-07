package ru.msrpo.chat.auth;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;
import ru.msrpo.chat.config.JwtProperties;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class JwtServiceTest {
    private static final String SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    private final JwtService tokens = new JwtService(new JwtProperties(SECRET, "msrpo-chat", Duration.ofHours(1)));
    @Test void acceptsIssuedToken() {
        var id = UUID.randomUUID();
        assertThat(tokens.validate(tokens.issue(id)).id()).isEqualTo(id);
    }
    @Test void rejectsExpiredMissingExpirationWrongIssuerAndRefreshTokens() {
        assertThatThrownBy(() -> tokens.validate(signed("access", "msrpo-chat", Instant.now().minusSeconds(10)))).isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> tokens.validate(signed("access", "msrpo-chat", null))).isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> tokens.validate(signed("access", "other", Instant.now().plusSeconds(60)))).isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> tokens.validate(signed("refresh", "msrpo-chat", Instant.now().plusSeconds(60)))).isInstanceOf(JwtException.class);
        assertThatThrownBy(() -> tokens.validate("broken")).isInstanceOf(JwtException.class);
    }
    @Test void rejectsSignatureWithDifferentKey() {
        var other = new JwtService(new JwtProperties("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=", "msrpo-chat", Duration.ofHours(1)));
        assertThatThrownBy(() -> tokens.validate(other.issue(UUID.randomUUID()))).isInstanceOf(JwtException.class);
    }
    private String signed(String type, String issuer, Instant expiration) {
        var builder = Jwts.builder().subject(UUID.randomUUID().toString()).issuer(issuer).claim("type", type);
        if (expiration != null) builder.expiration(Date.from(expiration));
        return builder.signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET))).compact();
    }
}
