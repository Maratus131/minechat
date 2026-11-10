package ru.msrpo.chat.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ApiException;
import java.net.URI;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class PushSubscriptionService {
    private final WebPushSubscriptionRepository subscriptions;
    private final PushProperties properties;
    private final ru.msrpo.chat.user.UserRepository users;

    public PushDtos.ConfigResponse config() {
        return new PushDtos.ConfigResponse(properties.enabled() ? properties.publicKey() : null);
    }

    @Transactional
    public void register(ChatPrincipal viewer, PushDtos.RegisterRequest request) {
        if (!properties.enabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Push-уведомления на сервере пока не настроены");
        if (!viewer.expiresAt().isAfter(Instant.now())) throw new ApiException(HttpStatus.UNAUTHORIZED, "Сеанс завершён");
        validateEndpoint(request.endpoint());
        try {
            byte[] key = Base64.getUrlDecoder().decode(request.keys().p256dh());
            byte[] auth = Base64.getUrlDecoder().decode(request.keys().auth());
            if (key.length != 65 || key[0] != 4 || auth.length != 16) throw new IllegalArgumentException();
            nl.martijndwars.webpush.Utils.loadPublicKey(request.keys().p256dh());
        } catch (Exception error) { throw ApiException.badRequest("Некорректные ключи подписки"); }
        users.lockById(viewer.id()).orElseThrow(ApiException::notFound);
        var subscription = subscriptions.findByEndpoint(request.endpoint()).orElseGet(() -> WebPushSubscription.create(request.endpoint()));
        if (subscription.getUserId() != null && !viewer.id().equals(subscription.getUserId())
            && (!subscription.getP256dh().equals(request.keys().p256dh()) || !subscription.getAuth().equals(request.keys().auth())))
            throw new ApiException(HttpStatus.CONFLICT, "Подписка браузера уже существует с другими ключами");
        if (!viewer.id().equals(subscription.getUserId()) && subscriptions.countByUserIdAndExpiresAtAfter(viewer.id(), Instant.now()) >= 10)
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "Не более 10 браузеров с уведомлениями");
        subscription.register(viewer.id(), request.keys().p256dh(), request.keys().auth(), viewer.expiresAt());
        subscriptions.save(subscription);
        subscriptions.deleteByExpiresAtBefore(Instant.now());
    }

    @Transactional
    public void remove(UUID user, String endpoint) { subscriptions.deleteByEndpointAndUserId(endpoint, user); }

    @Transactional
    public void removeInvalid(UUID id, UUID user) { subscriptions.deleteByIdAndUserId(id, user); }

    static URI validateEndpoint(String endpoint) {
        try {
            if (endpoint.length() > 2048 || endpoint.chars().anyMatch(value -> value > 127)) throw new IllegalArgumentException();
            var uri = URI.create(endpoint);
            String host = uri.getHost();
            boolean provider = host != null && (host.equals("fcm.googleapis.com")
                || host.equals("web.push.apple.com") || host.equals("updates.push.services.mozilla.com")
                || host.equals("push.services.mozilla.com") || host.endsWith(".push.services.mozilla.com")
                || host.endsWith(".notify.windows.com"));
            if (!"https".equals(uri.getScheme()) || !provider || uri.getUserInfo() != null || uri.getFragment() != null
                || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawPath() == null || uri.getRawPath().length() < 2)
                throw new IllegalArgumentException();
            return uri;
        } catch (IllegalArgumentException error) { throw ApiException.badRequest("Нужен HTTPS-адрес службы браузерных уведомлений"); }
    }
}
