package ru.msrpo.chat.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.*;
import static ru.msrpo.chat.auth.AuthDtos.*;

@Service
@RequiredArgsConstructor
public class SessionAuthService {
    private final AuthService authentication;
    private final PersistentSessionService sessions;
    private final JwtService tokens;

    public SignedIn register(RegisterRequest request, PersistentSession.Kind kind) { return persist(authentication.register(request), kind); }
    public SignedIn login(LoginRequest request, PersistentSession.Kind kind) { return persist(authentication.login(request), kind); }
    public SignedIn refresh(String rawToken, PersistentSession.Kind kind) {
        if (!SessionTokens.valid(rawToken)) throw new InvalidSessionException();
        var restored = sessions.restore(SessionTokens.hash(rawToken), kind);
        var auth = new AuthResponse(tokens.issue(restored.user().id()), "Bearer", tokens.expiresIn(), restored.user());
        return new SignedIn(auth, rawToken, restored.expiresAt());
    }
    public void logout(String rawToken, PersistentSession.Kind kind) {
        if (SessionTokens.valid(rawToken)) sessions.revoke(SessionTokens.hash(rawToken), kind);
    }
    private SignedIn persist(AuthResponse auth, PersistentSession.Kind kind) {
        String rawToken = SessionTokens.create();
        var expiresAt = sessions.create(auth.user().id(), SessionTokens.hash(rawToken), kind);
        return new SignedIn(auth, rawToken, expiresAt);
    }
    public record SignedIn(AuthResponse auth, String refreshToken, Instant refreshExpiresAt) {
        public long refreshExpiresIn() { return Math.max(0, Duration.between(Instant.now(), refreshExpiresAt).toSeconds()); }
        public DeviceAuthResponse deviceResponse() {
            return new DeviceAuthResponse(auth.accessToken(), auth.tokenType(), auth.expiresIn(), auth.user(), refreshToken, refreshExpiresIn());
        }
        @Override public String toString() { return "SignedIn[credentials=REDACTED]"; }
    }
}
