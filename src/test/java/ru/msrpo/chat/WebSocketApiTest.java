package ru.msrpo.chat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class WebSocketApiTest {
    @LocalServerPort int port;
    @Autowired JsonMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Test
    void authenticatesElectronOriginAndDeliversOnlyAuthorizedDirectGroupAndChannelEvents() throws Exception {
        var alice = register(); var bob = register(); var eve = register();
        var dialog = request("POST", "/conversations", alice, Map.of("userId", bob.path("user").path("id").asText()));
        String id = dialog.path("id").asText();
        var bobEvents = new Frames(); var eveEvents = new Frames();
        var bobSocket = connect(bobEvents, "minechat://app"); var eveSocket = connect(eveEvents, null);
        try {
            authenticate(bobSocket, bob); authenticate(eveSocket, eve);
            assertThat(bobEvents.event("ready").path("data").path("userId").asText()).isEqualTo(bob.path("user").path("id").asText());
            eveEvents.event("ready");
            assertThat(request("GET", "/conversations/" + id + "/presence", alice, null).path("online").asBoolean()).isTrue();
            var sent = request("POST", "/conversations/" + id + "/messages", alice, Map.of("text", "direct-ws"));
            assertThat(bobEvents.event("message.created").path("data").path("text").asText()).isEqualTo("direct-ws");
            request("DELETE", "/conversations/" + id + "/messages/" + sent.path("id").asLong(), alice, null);
            assertThat(bobEvents.event("message.deleted").path("data").path("conversationId").asText()).isEqualTo(id);
            var group = request("POST", "/groups", alice, Map.of("title", "WS group", "memberIds", List.of(bob.path("user").path("id").asText())));
            request("POST", "/conversations/" + group.path("id").asText() + "/messages", alice, Map.of("text", "group-ws"));
            assertThat(bobEvents.event("message.created").path("data").path("text").asText()).isEqualTo("group-ws");
            var channel = request("POST", "/channels", alice, Map.of("username", "c" + UUID.randomUUID().toString().replace("-", "").substring(0, 15), "title", "WS channel"));
            request("POST", "/channels/" + channel.path("id").asText() + "/subscription", bob, null);
            request("POST", "/conversations/" + channel.path("id").asText() + "/messages", alice, Map.of("text", "channel-ws"));
            assertThat(bobEvents.event("message.created").path("data").path("text").asText()).isEqualTo("channel-ws");
            eveEvents.assertNoMessageEvents();
            bobSocket.sendClose(WebSocket.NORMAL_CLOSURE, "done").join();
            bobEvents.closed.get(5, TimeUnit.SECONDS);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
            boolean online;
            do { online = request("GET", "/conversations/" + id + "/presence", alice, null).path("online").asBoolean(); }
            while (online && System.nanoTime() < deadline);
            assertThat(online).isFalse();
        } finally { bobSocket.abort(); eveSocket.abort(); }
    }

    @Test
    void refusesInvalidAuthenticationUnknownFramesAndUntrustedOrigins() throws Exception {
        var invalid = new Frames(); var socket = connect(invalid, null);
        socket.sendText("{\"type\":\"auth\",\"token\":\"invalid\"}", true).join();
        assertThat(invalid.closed.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
        var unknown = new Frames(); var second = connect(unknown, null);
        second.sendText("{\"type\":\"send\",\"text\":\"anonymous\"}", true).join();
        assertThat(unknown.closed.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
        var denied = catchThrowableOfType(CompletionException.class, () -> connect(new Frames(), "https://untrusted.example"));
        assertThat(denied.getCause()).isInstanceOf(WebSocketHandshakeException.class);
        assertThat(((WebSocketHandshakeException) denied.getCause()).getResponse().statusCode()).isEqualTo(403);
        var sameOrigin = new Frames();
        var localSocket = connect(sameOrigin, "http://127.0.0.1:" + port);
        localSocket.sendText("{}", true).join();
        assertThat(sameOrigin.closed.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
        assertThat(invalid.frames).isEmpty(); assertThat(unknown.frames).isEmpty();
    }

    private JsonNode register() throws Exception {
        return request("POST", "/auth/register", null, Map.of("username", "ws" + UUID.randomUUID().toString().replace("-", "").substring(0, 18), "displayName", "WS test", "password", "test-password-123"));
    }
    private JsonNode request(String method, String path, JsonNode user, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path)).timeout(Duration.ofSeconds(10));
        if (user != null) builder.header("Authorization", "Bearer " + user.path("accessToken").asText());
        if (body != null) builder.header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)));
        var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as("%s %s: %s", method, path, response.body()).isBetween(200, 299);
        return response.body().isEmpty() ? null : json.readTree(response.body());
    }
    private WebSocket connect(Frames listener, String origin) {
        var builder = http.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5));
        if (origin != null) builder.header("Origin", origin);
        return builder.buildAsync(URI.create("ws://127.0.0.1:" + port + "/api/v1/ws"), listener).join();
    }
    private void authenticate(WebSocket socket, JsonNode user) {
        socket.sendText(json.writeValueAsString(Map.of("type", "auth", "token", user.path("accessToken").asText())), true).join();
    }
    private class Frames implements WebSocket.Listener {
        final BlockingQueue<JsonNode> frames = new LinkedBlockingQueue<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        final StringBuilder text = new StringBuilder();
        @Override public void onOpen(WebSocket socket) { socket.request(1); }
        @Override public CompletionStage<?> onText(WebSocket socket, CharSequence part, boolean last) {
            text.append(part);
            if (last) { frames.add(json.readTree(text.toString())); text.setLength(0); }
            socket.request(1); return null;
        }
        @Override public CompletionStage<?> onClose(WebSocket socket, int code, String reason) { closed.complete(code); return null; }
        @Override public void onError(WebSocket socket, Throwable failure) { closed.completeExceptionally(failure); }
        JsonNode event(String event) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
            while (System.nanoTime() < deadline) {
                var frame = frames.poll(1, TimeUnit.SECONDS);
                if (frame != null && event.equals(frame.path("event").asText())) return frame;
            }
            throw new AssertionError("No WebSocket event: " + event);
        }
        void assertNoMessageEvents() throws Exception {
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(400);
            while (System.nanoTime() < deadline) {
                var frame = frames.poll(50, TimeUnit.MILLISECONDS);
                if (frame != null) assertThat(frame.path("event").asText()).isNotIn("message.created", "message.deleted");
            }
        }
    }
}
