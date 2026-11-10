package ru.msrpo.chat.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;
import static ru.msrpo.chat.auth.AuthDtos.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@SecurityRequirements
public class AuthController {
    private final SessionAuthService auth;
    private final SessionCookie cookie;
    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED) @Operation(summary = "Регистрация")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request, HttpServletResponse response) {
        var signedIn = auth.register(request, PersistentSession.Kind.WEB);
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.create(signedIn.refreshToken())); return signedIn.auth();
    }
    @PostMapping("/login") @Operation(summary = "Вход")
    public AuthResponse login(@Valid @RequestBody LoginRequest request, HttpServletResponse response) {
        var signedIn = auth.login(request, PersistentSession.Kind.WEB);
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.create(signedIn.refreshToken())); return signedIn.auth();
    }
    @PostMapping("/refresh") @Operation(summary = "Восстановить вход по HttpOnly cookie")
    public AuthResponse refresh(@CookieValue(name = SessionCookie.NAME, required = false) String token) {
        return auth.refresh(token, PersistentSession.Kind.WEB).auth();
    }
    @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) @Operation(summary = "Завершить текущий браузерный сеанс")
    public void logout(@CookieValue(name = SessionCookie.NAME, required = false) String token, HttpServletResponse response) {
        auth.logout(token, PersistentSession.Kind.WEB); response.addHeader(HttpHeaders.SET_COOKIE, cookie.clear());
    }
}
