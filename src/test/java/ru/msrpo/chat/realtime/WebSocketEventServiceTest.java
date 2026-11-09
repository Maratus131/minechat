package ru.msrpo.chat.realtime;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.*;
import ru.msrpo.chat.auth.*;
import ru.msrpo.chat.user.*;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class WebSocketEventServiceTest {
    @Test
    void unauthenticatedSessionsReceiveNothingAndExpireAfterFiveSeconds() throws Exception {
        var clock = mock(Clock.class);
        var now = Instant.parse("2026-11-08T12:00:00Z");
        when(clock.instant()).thenReturn(now);
        var service = new WebSocketEventService(mock(JwtService.class), mock(UserRepository.class), JsonMapper.builder().build(), clock);
        var socket = socket("pending");
        service.open(socket);
        service.publish(List.of(UUID.randomUUID()), "message.created", Map.of("text", "private"));
        service.heartbeat();
        verify(socket, never()).sendMessage(any());
        when(clock.instant()).thenReturn(now.plusSeconds(5));
        service.expire();
        verify(socket).close(CloseStatus.POLICY_VIOLATION);
    }

    @Test
    void presenceTracksMultipleDevicesAndTokenExpiryAndLimitsConnections() throws Exception {
        var clock = mock(Clock.class); var tokens = mock(JwtService.class); var users = mock(UserRepository.class);
        var now = Instant.parse("2026-11-08T12:00:00Z"); var userId = UUID.randomUUID();
        when(clock.instant()).thenReturn(now);
        when(tokens.validate("token")).thenReturn(new ChatPrincipal(userId, now.plusSeconds(30)));
        var user = mock(ChatUser.class); when(user.isEnabled()).thenReturn(true);
        when(users.findById(userId)).thenReturn(Optional.of(user));
        var service = new WebSocketEventService(tokens, users, JsonMapper.builder().build(), clock);
        assertThat(service.isOnline(userId)).isFalse();
        for (int i = 0; i < 5; i++) { var socket = socket("s" + i); service.open(socket); service.authenticate(socket.getId(), "{\"type\":\"auth\",\"token\":\"token\"}"); }
        assertThat(service.isOnline(userId)).isTrue();
        var excess = socket("excess"); service.open(excess); service.authenticate("excess", "{\"type\":\"auth\",\"token\":\"token\"}");
        verify(excess).close(CloseStatus.POLICY_VIOLATION);
        service.remove("s0");
        assertThat(service.isOnline(userId)).isTrue();
        when(clock.instant()).thenReturn(now.plusSeconds(30));
        assertThat(service.isOnline(userId)).isFalse();
        service.expire();
        assertThat(service.isOnline(userId)).isFalse();
    }

    private WebSocketSession socket(String id) {
        var session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id); when(session.isOpen()).thenReturn(true);
        return session;
    }
}
