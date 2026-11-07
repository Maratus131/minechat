package ru.msrpo.chat.auth;

import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;
import ru.msrpo.chat.config.JwtProperties;
import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.*;

@Service
public class JwtService {
    private final JwtProperties properties;
    private final SecretKey key;
    public JwtService(JwtProperties properties) {
        this.properties = properties;
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(properties.secret()));
    }
    public String issue(UUID userId) {
        Instant now = Instant.now();
        return Jwts.builder().subject(userId.toString()).issuer(properties.issuer()).claim("type", "access")
            .issuedAt(Date.from(now)).expiration(Date.from(now.plus(properties.accessTtl())))
            .id(UUID.randomUUID().toString()).signWith(key).compact();
    }
    public long expiresIn() { return properties.accessTtl().toSeconds(); }
    public ChatPrincipal validate(String token) {
        Claims claims = Jwts.parser().verifyWith(key).requireIssuer(properties.issuer()).require("type", "access")
            .build().parseSignedClaims(token).getPayload();
        if (claims.getSubject() == null || claims.getSubject().isBlank()
                || claims.getExpiration() == null || !claims.getExpiration().toInstant().isAfter(Instant.now()))
            throw new JwtException("Missing or expired expiration");
        return new ChatPrincipal(UUID.fromString(claims.getSubject()), claims.getExpiration().toInstant());
    }
}
