package ru.msrpo.chat.auth;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import static ru.msrpo.chat.auth.AuthDtos.*;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@SecurityRequirements
public class AuthController {
    private final AuthService auth;
    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED) @Operation(summary = "Регистрация")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) { return auth.register(request); }
    @PostMapping("/login") @Operation(summary = "Вход")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) { return auth.login(request); }
}
