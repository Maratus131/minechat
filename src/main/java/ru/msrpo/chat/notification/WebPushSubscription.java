package ru.msrpo.chat.notification;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "web_push_subscriptions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WebPushSubscription {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(nullable = false) private UUID userId;
    @Column(nullable = false, unique = true, length = 2048) private String endpoint;
    @Column(nullable = false, length = 100) private String p256dh;
    @Column(nullable = false, length = 32) private String auth;
    @Column(nullable = false) private Instant expiresAt;

    static WebPushSubscription create(String endpoint) {
        var subscription = new WebPushSubscription(); subscription.endpoint = endpoint; return subscription;
    }
    void register(UUID userId, String p256dh, String auth, Instant expiresAt) {
        this.userId = userId; this.p256dh = p256dh; this.auth = auth; this.expiresAt = expiresAt;
    }
}
