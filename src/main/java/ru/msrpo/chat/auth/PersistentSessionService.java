package ru.msrpo.chat.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.config.AuthSessionProperties;
import ru.msrpo.chat.user.UserRepository;
import ru.msrpo.chat.user.UserResponse;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PersistentSessionService {
    private final PersistentSessionRepository sessions;
    private final UserRepository users;
    private final AuthSessionProperties properties;

    @Transactional
    public Instant create(UUID user, String tokenHash, PersistentSession.Kind kind) {
        var account = users.findById(user).filter(current -> current.isEnabled()).orElseThrow(InvalidSessionException::new);
        var expiresAt = Instant.now().plus(properties.sessionTtl());
        sessions.save(PersistentSession.create(account.getId(), tokenHash, kind, expiresAt));
        sessions.deleteByExpiresAtBefore(Instant.now());
        return expiresAt;
    }

    @Transactional(readOnly = true)
    public Restored restore(String tokenHash, PersistentSession.Kind kind) {
        var session = sessions.findByTokenHashAndKindAndExpiresAtAfter(tokenHash, kind, Instant.now()).orElseThrow(InvalidSessionException::new);
        var user = users.findById(session.getUserId()).filter(current -> current.isEnabled()).orElseThrow(InvalidSessionException::new);
        return new Restored(UserResponse.from(user), session.getExpiresAt());
    }

    @Transactional
    public void revoke(String tokenHash, PersistentSession.Kind kind) { sessions.deleteByTokenHashAndKind(tokenHash, kind); }
    public record Restored(UserResponse user, Instant expiresAt) {}
}
