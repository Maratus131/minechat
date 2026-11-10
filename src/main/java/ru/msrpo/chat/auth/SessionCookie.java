package ru.msrpo.chat.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import ru.msrpo.chat.config.AuthSessionProperties;
import java.time.Duration;

@Component
@RequiredArgsConstructor
public class SessionCookie {
    public static final String NAME = "minechat_refresh";
    private final AuthSessionProperties properties;
    public String create(String token) { return cookie(token, properties.sessionTtl()); }
    public String clear() { return cookie("", Duration.ZERO); }
    private String cookie(String token, Duration age) {
        return ResponseCookie.from(NAME, token).httpOnly(true).secure(properties.cookieSecure())
            .sameSite("Strict").path("/api/v1/auth").maxAge(age).build().toString();
    }
}
