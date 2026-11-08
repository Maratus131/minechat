package ru.msrpo.chat.realtime;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ApiException;
import java.io.IOException;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

@Service
public class EventService {
    private record Connection(SseEmitter emitter, Instant expiresAt) {}
    private final ConcurrentHashMap<UUID, CopyOnWriteArrayList<Connection>> connections = new ConcurrentHashMap<>();
    private final Clock clock;

    public EventService() { this(Clock.systemUTC()); }
    EventService(Clock clock) { this.clock = clock; }

    public boolean isOnline(UUID user) {
        var clients = connections.get(user);
        var now = clock.instant();
        return clients != null && clients.stream().anyMatch(client -> client.expiresAt().isAfter(now));
    }

    public SseEmitter subscribe(ChatPrincipal viewer) {
        long timeout = Duration.between(clock.instant(), viewer.expiresAt()).toMillis();
        if (timeout <= 0) throw new ApiException(HttpStatus.UNAUTHORIZED, "Токен истёк");
        var emitter = new SseEmitter(timeout);
        var connection = new Connection(emitter, viewer.expiresAt());
        connections.compute(viewer.id(), (id, current) -> {
            var list = current == null ? new CopyOnWriteArrayList<Connection>() : current;
            if (list.size() >= 5) throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Не более 5 подключений к событиям");
            list.add(connection); return list;
        });
        emitter.onCompletion(() -> remove(viewer.id(), connection));
        emitter.onTimeout(() -> { remove(viewer.id(), connection); emitter.complete(); });
        emitter.onError(error -> remove(viewer.id(), connection));
        send(viewer.id(), connection, SseEmitter.event().name("ready").data(Map.of("userId", viewer.id())));
        return emitter;
    }
    @TransactionalEventListener
    public void messageCreated(MessageCreated event) {
        for (UUID user : event.recipients()) {
            var clients = connections.get(user);
            if (clients != null) for (var client : clients)
                send(user, client, SseEmitter.event().name("message.created").id(Long.toString(event.message().id())).data(event.message()));
        }
    }
    @TransactionalEventListener
    public void messageDeleted(MessageDeleted event) {
        var payload = Map.of("conversationId", event.conversationId(), "messageId", event.messageId());
        for (UUID user : event.recipients()) {
            var clients = connections.get(user);
            if (clients != null) for (var client : clients)
                send(user, client, SseEmitter.event().name("message.deleted").data(payload));
        }
    }
    @Scheduled(fixedDelay = 20000)
    public void heartbeat() {
        connections.forEach((user, clients) -> clients.forEach(client -> send(user, client, SseEmitter.event().comment("heartbeat"))));
    }
    private void send(UUID user, Connection connection, SseEmitter.SseEventBuilder event) {
        if (!connection.expiresAt().isAfter(clock.instant())) {
            remove(user, connection); connection.emitter().complete(); return;
        }
        try { connection.emitter().send(event); }
        catch (IOException | IllegalStateException error) {
            remove(user, connection);
            connection.emitter().completeWithError(error);
        }
    }
    private void remove(UUID user, Connection connection) {
        connections.computeIfPresent(user, (id, list) -> { list.remove(connection); return list.isEmpty() ? null : list; });
    }
}
