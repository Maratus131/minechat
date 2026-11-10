package ru.msrpo.chat.auth;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "auth_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PersistentSession {
    public enum Kind { WEB, DEVICE }
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(nullable = false) private UUID userId;
    @Column(nullable = false, unique = true, length = 64) private String tokenHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private Kind kind;
    @Column(nullable = false) private Instant expiresAt;

    static PersistentSession create(UUID userId, String tokenHash, Kind kind, Instant expiresAt) {
        var session = new PersistentSession(); session.userId = userId; session.tokenHash = tokenHash;
        session.kind = kind; session.expiresAt = expiresAt; return session;
    }
}
