package ru.msrpo.chat.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;
import ru.msrpo.chat.realtime.ChatWebSocketHandler;
import java.util.ArrayList;

@Configuration(proxyBeanMethods = false)
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {
    private final ChatWebSocketHandler handler;
    private final SecurityConfig.CorsProperties cors;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        var origins = new ArrayList<>(cors.allowedOrigins());
        origins.add("minechat://app");
        registry.addHandler(handler, "/api/v1/ws").setAllowedOrigins(origins.toArray(String[]::new));
    }
}
