package ru.msrpo.chat.notification;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.time.Instant;
import java.util.*;

public interface WebPushSubscriptionRepository extends JpaRepository<WebPushSubscription, UUID> {
    Optional<WebPushSubscription> findByEndpoint(String endpoint);
    @Query("select s from WebPushSubscription s, ChatUser u where u.id = s.userId and u.enabled = true and s.userId in :users and s.expiresAt > :now")
    List<WebPushSubscription> findByUserIdInAndExpiresAtAfter(Collection<UUID> users, Instant now);
    long countByUserIdAndExpiresAtAfter(UUID userId, Instant now);
    void deleteByEndpointAndUserId(String endpoint, UUID userId);
    void deleteByIdAndUserId(UUID id, UUID userId);
    void deleteByExpiresAtBefore(Instant now);
    boolean existsByIdAndUserIdAndExpiresAtAfter(UUID id, UUID userId, Instant now);
}
