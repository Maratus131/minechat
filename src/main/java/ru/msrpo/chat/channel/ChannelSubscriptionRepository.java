package ru.msrpo.chat.channel;

import org.springframework.data.jpa.repository.*;
import org.springframework.data.domain.*;
import java.util.*;

public interface ChannelSubscriptionRepository extends JpaRepository<ChannelSubscription, UUID> {
    boolean existsByConversationIdAndUserId(UUID conversationId, UUID userId);
    @EntityGraph(attributePaths = "user")
    Optional<ChannelSubscription> findByConversationIdAndUserId(UUID conversationId, UUID userId);
    @EntityGraph(attributePaths = "user")
    Slice<ChannelSubscription> findByConversationIdOrderByUserUsername(UUID conversationId, Pageable pageable);
    void deleteByConversationIdAndUserId(UUID conversationId, UUID userId);
    long countByConversationId(UUID conversationId);

    @Query("select s.user.id from ChannelSubscription s where s.conversation.id = :conversationId order by s.user.id")
    List<UUID> findSubscriberIds(UUID conversationId);

    interface SubscriberCount {
        UUID getChannelId();
        long getTotal();
    }
    @Query("select s.conversation.id as channelId, count(s) as total from ChannelSubscription s where s.conversation.id in :ids group by s.conversation.id")
    List<SubscriberCount> countForChannels(Collection<UUID> ids);

    @Query("select s.conversation.id from ChannelSubscription s where s.user.id = :viewer and s.conversation.id in :ids")
    List<UUID> findSubscribedChannelIds(UUID viewer, Collection<UUID> ids);
    @Query("select s from ChannelSubscription s where s.user.id = :viewer and s.conversation.id in :ids")
    List<ChannelSubscription> findViewerSubscriptions(UUID viewer, Collection<UUID> ids);
}
