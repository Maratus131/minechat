package ru.msrpo.chat.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import ru.msrpo.chat.common.ApiException;
import ru.msrpo.chat.user.*;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import static ru.msrpo.chat.auth.AuthDtos.*;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JwtService tokens;
    // A valid hash makes an unknown login perform the same expensive password check.
    private final String dummyHash = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(12).encode("not-a-user-password");

    // BCrypt work must not hold a DB transaction; saveAndFlush keeps its own short write transaction.
    public AuthResponse register(RegisterRequest request) {
        validatePasswordLength(request.password());
        var user = ChatUser.create(request.username().toLowerCase(Locale.ROOT), request.displayName().trim(), passwords.encode(request.password()));
        try { users.saveAndFlush(user); }
        catch (DataIntegrityViolationException error) { throw new ApiException(HttpStatus.CONFLICT, "Логин уже занят"); }
        return response(user);
    }
    public AuthResponse login(LoginRequest request) {
        validatePasswordLength(request.password());
        var user = users.findByUsername(request.username().trim().toLowerCase(Locale.ROOT));
        boolean matches = passwords.matches(request.password(), user.map(ChatUser::getPasswordHash).orElse(dummyHash));
        if (!matches || user.isEmpty() || !user.get().isEnabled())
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Неверный логин или пароль");
        return response(user.get());
    }
    private AuthResponse response(ChatUser user) {
        return new AuthResponse(tokens.issue(user.getId()), "Bearer", tokens.expiresIn(), UserResponse.from(user));
    }
    private void validatePasswordLength(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72)
            throw ApiException.badRequest("Пароль должен занимать не более 72 байт UTF-8");
    }
}
