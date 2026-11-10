package ru.msrpo.chat.notification;

import nl.martijndwars.webpush.AbstractPushService;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.Utils;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import java.net.http.*;
import java.security.Security;
import java.time.Duration;
import java.time.Instant;

@Component
public class WebPushTransport {
    private final Encoder encoder;
    private final JsonMapper json;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
        .followRedirects(HttpClient.Redirect.NEVER).build();

    public WebPushTransport(PushProperties properties, JsonMapper json) {
        this.json = json;
        if (Security.getProvider("BC") == null) Security.addProvider(new BouncyCastleProvider());
        try {
            encoder = properties.enabled() ? new Encoder(properties) : null;
            if (encoder != null && !Utils.verifyKeyPair(encoder.getPrivateKey(), encoder.getPublicKey()))
                throw new IllegalArgumentException("Web Push public and private keys do not match");
        } catch (Exception error) { throw new IllegalStateException("Invalid Web Push server keys", error); }
    }

    /** Returns true only when the provider says this subscription no longer exists. */
    public boolean send(WebPushSubscription target, PushPayload payload) throws Exception {
        if (encoder == null || !target.getExpiresAt().isAfter(Instant.now())) return false;
        var request = prepare(target, payload);
        var response = client.send(request, HttpResponse.BodyHandlers.discarding());
        int status = response.statusCode();
        if (status == 404 || status == 410) return true;
        if (status < 200 || status >= 300) throw new IllegalStateException("Push provider HTTP " + status);
        return false;
    }

    HttpRequest prepare(WebPushSubscription target, PushPayload payload) throws Exception {
        PushSubscriptionService.validateEndpoint(target.getEndpoint());
        int ttl = (int) Math.max(0, Math.min(60, Duration.between(Instant.now(), target.getExpiresAt()).toSeconds()));
        var notification = new Notification(target.getEndpoint(), target.getP256dh(), target.getAuth(), json.writeValueAsBytes(payload), ttl);
        var encoded = encoder.encode(notification);
        var builder = HttpRequest.newBuilder(PushSubscriptionService.validateEndpoint(encoded.getUrl()))
            .timeout(Duration.ofSeconds(5)).POST(HttpRequest.BodyPublishers.ofByteArray(encoded.getBody()));
        encoded.getHeaders().forEach(builder::header);
        return builder.build();
    }

    private static final class Encoder extends AbstractPushService<Encoder> {
        Encoder(PushProperties properties) throws Exception { super(properties.publicKey(), properties.privateKey(), properties.subject()); }
        nl.martijndwars.webpush.HttpRequest encode(Notification notification) throws Exception {
            return prepareRequest(notification, Encoding.AES128GCM);
        }
    }
}
