package ru.msrpo.chat.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import static ru.msrpo.chat.auth.AuthDtos.*;

@RestController
@RequestMapping("/api/v1/auth/device")
@RequiredArgsConstructor
@SecurityRequirements
public class DeviceAuthController {
    private final SessionAuthService auth;
    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED) @Operation(summary = "Регистрация с сеансом для приложения")
    public DeviceAuthResponse register(@Valid @RequestBody RegisterRequest request) { return auth.register(request, PersistentSession.Kind.DEVICE).deviceResponse(); }
    @PostMapping("/login") @Operation(summary = "Вход с сеансом для приложения")
    public DeviceAuthResponse login(@Valid @RequestBody LoginRequest request) { return auth.login(request, PersistentSession.Kind.DEVICE).deviceResponse(); }
    @PostMapping("/refresh") @Operation(summary = "Восстановить вход приложения по refresh token")
    public DeviceAuthResponse refresh(@Valid @RequestBody RefreshRequest request) { return auth.refresh(request.refreshToken(), PersistentSession.Kind.DEVICE).deviceResponse(); }
    @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) @Operation(summary = "Отозвать текущий сеанс приложения")
    public void logout(@Valid @RequestBody RefreshRequest request) { auth.logout(request.refreshToken(), PersistentSession.Kind.DEVICE); }
}
