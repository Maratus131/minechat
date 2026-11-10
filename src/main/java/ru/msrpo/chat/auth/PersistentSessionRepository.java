package ru.msrpo.chat.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import java.time.Instant;
import java.util.*;

public interface PersistentSessionRepository extends JpaRepository<PersistentSession, UUID> {
    Optional<PersistentSession> findByTokenHashAndKindAndExpiresAtAfter(String hash, PersistentSession.Kind kind, Instant now);
    void deleteByTokenHashAndKind(String hash, PersistentSession.Kind kind);
    void deleteByExpiresAtBefore(Instant now);
}
