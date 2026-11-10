package ru.msrpo.chat.notification;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import ru.msrpo.chat.message.MessageResponse;
import ru.msrpo.chat.realtime.MessageCreated;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PushApiTest {
    private static final PushProperties SERVER = PushTestKeys.generate();
    private static final PushProperties BROWSER = PushTestKeys.generate();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.push.public-key", SERVER::publicKey); registry.add("app.push.private-key", SERVER::privateKey); registry.add("app.push.subject", SERVER::subject);
    }
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate database;
    @Autowired ApplicationEventPublisher events;
    @Autowired PlatformTransactionManager transactions;
    @MockitoBean WebPushTransport transport;

    @Test void requiresAuthenticationAndOnlyRemovesOwnSubscription() throws Exception {
        var alice = register(); var bob = register(); String endpoint = endpoint();
        mvc.perform(get("/api/v1/notifications/config")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/notifications/config").header("Authorization", bearer(alice)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.webPushPublicKey").value(SERVER.publicKey()))
            .andExpect(jsonPath("$.privateKey").doesNotExist());
        subscribe(alice, endpoint);
        mvc.perform(delete("/api/v1/notifications/web-push").header("Authorization", bearer(bob)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("endpoint", endpoint)))).andExpect(status().isNoContent());
        assertThat(database.queryForObject("select count(*) from web_push_subscriptions where endpoint=?", Integer.class, endpoint)).isEqualTo(1);
        subscribe(bob, endpoint); // Same browser signing into another account transfers its capability.
        mvc.perform(delete("/api/v1/notifications/web-push").header("Authorization", bearer(alice)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("endpoint", endpoint)))).andExpect(status().isNoContent());
        assertThat(database.queryForObject("select user_id from web_push_subscriptions where endpoint=?", UUID.class, endpoint))
            .isEqualTo(UUID.fromString(bob.path("user").path("id").asText()));
        mvc.perform(delete("/api/v1/notifications/web-push").header("Authorization", bearer(bob)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("endpoint", endpoint)))).andExpect(status().isNoContent());
        assertThat(database.queryForObject("select count(*) from web_push_subscriptions where endpoint=?", Integer.class, endpoint)).isZero();
    }

    @Test void validatesProviderAndKeysAndCapsActiveDevices() throws Exception {
        var user = register();
        mvc.perform(put("/api/v1/notifications/web-push").header("Authorization", bearer(user)).contentType("application/json")
            .content(subscription("https://127.0.0.1/private"))).andExpect(status().isBadRequest());
        mvc.perform(put("/api/v1/notifications/web-push").header("Authorization", bearer(user)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("endpoint", endpoint(), "keys", Map.of("p256dh", "broken", "auth", "broken")))))
            .andExpect(status().isBadRequest());
        for (int index = 0; index < 10; index++) subscribe(user, endpoint());
        mvc.perform(put("/api/v1/notifications/web-push").header("Authorization", bearer(user)).contentType("application/json")
            .content(subscription(endpoint()))).andExpect(status().isTooManyRequests());
    }

    @Test void sendsOnlyAfterCommitToRecipientsExcludingSenderAndNeverOnEditDeleteOrRollback() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        subscribe(alice, endpoint()); subscribe(bob, endpoint()); subscribe(eve, endpoint());
        String bobId = bob.path("user").path("id").asText();
        var opened = mvc.perform(post("/api/v1/conversations").header("Authorization", bearer(alice)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("userId", bobId)))).andExpect(status().isOk()).andReturn();
        String dialog = json.readTree(opened.getResponse().getContentAsString()).path("id").asText();
        var sent = mvc.perform(post("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(alice)).contentType("application/json")
            .content("{\"text\":\"private text\"}")).andExpect(status().isCreated()).andReturn();
        var payload = ArgumentCaptor.forClass(PushPayload.class);
        verify(transport, timeout(3000).times(1)).send(any(), payload.capture());
        assertThat(payload.getValue().recipientId()).isEqualTo(UUID.fromString(bobId));
        assertThat(payload.getValue().body()).isEqualTo("Новое сообщение");
        assertThat(payload.getValue().url()).isEqualTo("/chats/" + dialog);
        assertThat(payload.getValue().expiresAt()).isBeforeOrEqualTo(java.time.Instant.now().plusSeconds(bob.path("expiresIn").asLong()));
        var message = json.readValue(sent.getResponse().getContentAsString(), MessageResponse.class);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            events.publishEvent(new MessageCreated(message, List.of(UUID.fromString(bobId)))); status.setRollbackOnly();
        });
        mvc.perform(put("/api/v1/conversations/{id}/messages/{message}", dialog, message.id()).header("Authorization", bearer(alice)).contentType("application/json")
            .content("{\"text\":\"edited\"}")).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/conversations/{id}/messages/{message}", dialog, message.id()).header("Authorization", bearer(alice))).andExpect(status().isOk());
        verify(transport, after(200).times(1)).send(any(), any());
    }

    @Test void expiredSubscriptionReceivesNothing() throws Exception {
        var alice = register(); var bob = register(); String target = endpoint(); subscribe(bob, target);
        database.update("update web_push_subscriptions set expires_at=? where endpoint=?", java.sql.Timestamp.from(java.time.Instant.now().minusSeconds(10)), target);
        var opened = mvc.perform(post("/api/v1/conversations").header("Authorization", bearer(alice)).contentType("application/json")
            .content(json.writeValueAsString(Map.of("userId", bob.path("user").path("id").asText())))).andExpect(status().isOk()).andReturn();
        String dialog = json.readTree(opened.getResponse().getContentAsString()).path("id").asText();
        mvc.perform(post("/api/v1/conversations/{id}/messages", dialog).header("Authorization", bearer(alice)).contentType("application/json")
            .content("{\"text\":\"expired browser\"}")).andExpect(status().isCreated());
        verify(transport, after(200).never()).send(any(), any());
    }

    private JsonNode register() throws Exception {
        var result = mvc.perform(post("/api/v1/auth/register").contentType("application/json").content(json.writeValueAsString(Map.of(
            "username", "p" + UUID.randomUUID().toString().replace("-", "").substring(0, 20), "displayName", "Push user", "password", "password123"))))
            .andExpect(status().isCreated()).andReturn();
        return json.readTree(result.getResponse().getContentAsString());
    }
    private static String bearer(JsonNode user) { return "Bearer " + user.path("accessToken").asText(); }
    private static String endpoint() { return "https://fcm.googleapis.com/wp/" + UUID.randomUUID(); }
    private String subscription(String endpoint) throws Exception {
        return json.writeValueAsString(Map.of("endpoint", endpoint, "keys", Map.of("p256dh", BROWSER.publicKey(),
            "auth", Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]))));
    }
    private void subscribe(JsonNode user, String endpoint) throws Exception {
        mvc.perform(put("/api/v1/notifications/web-push").header("Authorization", bearer(user)).contentType("application/json").content(subscription(endpoint)))
            .andExpect(status().isNoContent());
    }
}
