package ru.msrpo.chat.notification;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PushTransportTest {
    @Test void encryptsBrowserPayloadWithVapidAndBoundedTtlWithoutMakingAnyNetworkRequest() throws Exception {
        var server = PushTestKeys.generate(); var browser = PushTestKeys.generate();
        var transport = new WebPushTransport(server, JsonMapper.builder().build());
        var target = WebPushSubscription.create("https://fcm.googleapis.com/wp/test");
        target.register(UUID.randomUUID(), browser.publicKey(), Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]), Instant.now().plusSeconds(3600));
        var payload = new PushPayload("message.created", 1, UUID.randomUUID(), target.getUserId(), "User", "Новое сообщение", "/chats/test", target.getExpiresAt());
        var request = transport.prepare(target, payload);
        assertThat(request.headers().firstValue("Authorization").orElseThrow()).startsWith("vapid t=").contains(", k=");
        assertThat(request.headers().firstValue("Content-Encoding").orElseThrow()).isEqualTo("aes128gcm");
        assertThat(Integer.parseInt(request.headers().firstValue("TTL").orElseThrow())).isBetween(1, 60);
        assertThat(request.timeout().orElseThrow().toSeconds()).isEqualTo(5);
        assertThat(request.bodyPublisher().orElseThrow().contentLength()).isGreaterThan(100);
    }

    @Test void rejectsPrivateEndpointsAndIncompleteConfigurationAndRedactsSecrets() {
        for (var endpoint : List.of("http://fcm.googleapis.com/wp/test", "https://localhost/test", "https://127.0.0.1/test",
            "https://fcm.googleapis.com.evil.test/wp/test", "https://evil.test/fcm.googleapis.com", "https://fcm.googleapis.com:8443/test",
            "https://user@fcm.googleapis.com/wp/test", "https://fcm.googleapis.com/wp/test#fragment"))
            assertThatThrownBy(() -> PushSubscriptionService.validateEndpoint(endpoint)).isInstanceOf(ru.msrpo.chat.common.ApiException.class);
        assertThatThrownBy(() -> new PushProperties("public", "", "")).isInstanceOf(IllegalArgumentException.class);
        assertThat(new PushProperties("", "", "").enabled()).isFalse();
        var keys = PushTestKeys.generate();
        assertThat(keys.toString()).doesNotContain(keys.privateKey()).doesNotContain(keys.publicKey());
    }

    @Test void disabledProviderHasNoPublicKeyAndStillAllowsUnsubscribe() {
        var repository = mock(WebPushSubscriptionRepository.class);
        var service = new PushSubscriptionService(repository, new PushProperties("", "", ""), mock(ru.msrpo.chat.user.UserRepository.class));
        assertThat(service.config().webPushPublicKey()).isNull();
        var user = UUID.randomUUID();
        service.remove(user, "https://fcm.googleapis.com/wp/disabled");
        verify(repository).deleteByEndpointAndUserId("https://fcm.googleapis.com/wp/disabled", user);
        assertThatThrownBy(() -> service.register(new ru.msrpo.chat.auth.ChatPrincipal(user, Instant.now().plusSeconds(60)),
            new PushDtos.RegisterRequest("unused", null))).isInstanceOfSatisfying(ru.msrpo.chat.common.ApiException.class,
                error -> assertThat(error.status().value()).isEqualTo(503));
    }
}
