package ru.msrpo.chat.realtime;

import io.jsonwebtoken.JwtException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.auth.JwtService;
import ru.msrpo.chat.user.UserRepository;
import tools.jackson.databind.json.JsonMapper;
import java.io.IOException;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class WebSocketEventService {
    private static final int MAX_AUTH_BYTES = 16 * 1024;
    private static final int MAX_CONNECTIONS = 5;
    private static final Duration AUTH_TIMEOUT = Duration.ofSeconds(5);
    private final JwtService tokens;
    private final UserRepository users;
    private final JsonMapper json;
    private final Clock clock;
    private final ConcurrentHashMap<String, Connection> connections = new ConcurrentHashMap<>();

    private static final class Connection {
        final WebSocketSession session;
        final Instant authDeadline;
        volatile ChatPrincipal principal;
        volatile boolean ready;
        Connection(WebSocketSession session, Instant authDeadline) {
            this.session = new ConcurrentWebSocketSessionDecorator(session, 10_000, 512 * 1024);
            this.authDeadline = authDeadline;
        }
    }

    @org.springframework.beans.factory.annotation.Autowired
    public WebSocketEventService(JwtService tokens, UserRepository users, JsonMapper json) {
        this(tokens, users, json, Clock.systemUTC());
    }
    WebSocketEventService(JwtService tokens, UserRepository users, JsonMapper json, Clock clock) {
        this.tokens = tokens; this.users = users; this.json = json; this.clock = clock;
    }

    public void open(WebSocketSession session) {
        session.setTextMessageSizeLimit(MAX_AUTH_BYTES);
        connections.put(session.getId(), new Connection(session, clock.instant().plus(AUTH_TIMEOUT)));
    }

    public void authenticate(String id, String payload) {
        var connection = connections.get(id);
        if (connection == null) return;
        synchronized (connection) {
            if (connection.principal != null || !connection.authDeadline.isAfter(clock.instant()) || payload.length() > MAX_AUTH_BYTES) {
                close(id, CloseStatus.POLICY_VIOLATION); return;
            }
            final ChatPrincipal principal;
            try {
                var frame = json.readTree(payload);
                if (!frame.isObject() || !"auth".equals(frame.path("type").asText()) || !frame.path("token").isTextual()) {
                    close(id, CloseStatus.POLICY_VIOLATION); return;
                }
                principal = tokens.validate(frame.path("token").asText());
            } catch (JwtException | IllegalArgumentException | tools.jackson.core.JacksonException error) {
                close(id, CloseStatus.POLICY_VIOLATION); return;
            }
            // Storage failures remain server errors rather than being reported as invalid credentials.
            if (!users.findById(principal.id()).map(user -> user.isEnabled()).orElse(false)) {
                close(id, CloseStatus.POLICY_VIOLATION); return;
            }
            synchronized (connections) {
                long count = connections.values().stream().filter(client -> client.principal != null
                    && client.principal.id().equals(principal.id()) && client.principal.expiresAt().isAfter(clock.instant())).count();
                if (count >= MAX_CONNECTIONS || connections.get(id) != connection || !connection.session.isOpen()) {
                    close(id, CloseStatus.POLICY_VIOLATION); return;
                }
                connection.principal = principal;
            }
            send(connection, "ready", Map.of("userId", principal.id()));
            connection.ready = connections.get(id) == connection;
        }
    }

    public boolean isOnline(UUID user) {
        var now = clock.instant();
        return connections.values().stream().anyMatch(client -> client.principal != null
            && client.principal.id().equals(user) && client.principal.expiresAt().isAfter(now) && client.session.isOpen());
    }

    public void publish(List<UUID> recipients, String event, Object data) {
        var targets = new HashSet<>(recipients);
        connections.values().forEach(client -> {
            if (client.ready && targets.contains(client.principal.id())) send(client, event, data);
        });
    }

    @Scheduled(fixedDelay = 1000)
    public void expire() {
        var now = clock.instant();
        connections.forEach((id, client) -> {
            if (!client.session.isOpen()) remove(id);
            else if (!(client.principal == null ? client.authDeadline : client.principal.expiresAt()).isAfter(now))
                close(id, CloseStatus.POLICY_VIOLATION);
        });
    }

    @Scheduled(fixedDelay = 20000)
    public void heartbeat() {
        connections.values().forEach(client -> { if (client.ready) send(client, "heartbeat", Map.of()); });
    }

    private void send(Connection client, String event, Object data) {
        if (client.principal == null || !client.principal.expiresAt().isAfter(clock.instant())) {
            close(client.session.getId(), CloseStatus.POLICY_VIOLATION); return;
        }
        try { client.session.sendMessage(new TextMessage(json.writeValueAsString(Map.of("event", event, "data", data)))); }
        catch (IOException | RuntimeException error) { close(client.session.getId(), CloseStatus.SERVER_ERROR); }
    }

    public void remove(String id) { connections.remove(id); }
    public void close(String id, CloseStatus status) {
        var client = connections.remove(id);
        if (client == null) return;
        try { client.session.close(status); } catch (IOException ignored) { /* The transport is already gone. */ }
    }
}
