package ru.msrpo.chat.realtime;

import org.junit.jupiter.api.Test;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ApiException;
import java.time.*;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class EventServiceTest {
    @Test
    void onlyUnexpiredConnectionsMakeUserOnline() {
        var clock = mock(Clock.class);
        var now = Instant.parse("2026-11-08T10:00:00Z");
        when(clock.instant()).thenReturn(now);
        var events = new EventService(clock);
        var user = UUID.randomUUID();
        assertThat(events.isOnline(user)).isFalse();
        events.subscribe(new ChatPrincipal(user, now.plusSeconds(30)));
        assertThat(events.isOnline(user)).isTrue();
        when(clock.instant()).thenReturn(now.plusSeconds(30));
        assertThat(events.isOnline(user)).isFalse();
        events.heartbeat();
        assertThat(events.isOnline(user)).isFalse();
    }

    @Test
    void anotherUnexpiredDeviceKeepsUserOnline() {
        var clock = mock(Clock.class);
        var now = Instant.parse("2026-11-08T10:00:00Z");
        when(clock.instant()).thenReturn(now);
        var events = new EventService(clock);
        var user = UUID.randomUUID();
        events.subscribe(new ChatPrincipal(user, now.plusSeconds(30)));
        events.subscribe(new ChatPrincipal(user, now.plusSeconds(60)));
        when(clock.instant()).thenReturn(now.plusSeconds(30));
        events.heartbeat();
        assertThat(events.isOnline(user)).isTrue();
        when(clock.instant()).thenReturn(now.plusSeconds(60));
        assertThat(events.isOnline(user)).isFalse();
    }

    @Test
    void refusesAlreadyExpiredConnections() {
        var events = new EventService();
        var user = UUID.randomUUID();
        assertThatThrownBy(() -> events.subscribe(new ChatPrincipal(user, Instant.now().minusSeconds(1))))
            .isInstanceOf(ApiException.class);
        assertThat(events.isOnline(user)).isFalse();
    }
}
