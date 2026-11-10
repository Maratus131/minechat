package ru.msrpo.chat.notification;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.conversation.ConversationRepository;
import ru.msrpo.chat.realtime.MessageCreated;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class PushDeliveryService {
    private static final Logger log = LoggerFactory.getLogger(PushDeliveryService.class);
    private final WebPushSubscriptionRepository subscriptions;
    private final ConversationRepository conversations;
    private final PushProperties properties;
    private final WebPushTransport transport;
    private final PushSubscriptionService cleanup;
    private final ru.msrpo.chat.group.GroupMemberRepository groupMembers;
    private final ru.msrpo.chat.channel.ChannelSubscriptionRepository channelSubscriptions;

    @Transactional(readOnly = true)
    public List<Delivery> prepare(MessageCreated event) {
        if (!properties.enabled() || event.message().deleted()) return List.of();
        var message = event.message();
        var recipients = event.recipients().stream().filter(id -> !id.equals(message.sender().id())).distinct().toList();
        if (recipients.isEmpty()) return List.of();
        var conversation = conversations.findById(message.conversationId()).orElse(null);
        if (conversation == null) return List.of();
        var currentMembers = conversation.isChannel() ? channelSubscriptions.findSubscriberIds(conversation.getId())
            : conversation.isGroup() ? groupMembers.findMemberIds(conversation.getId()) : recipients.stream().filter(conversation::includes).toList();
        var allowedRecipients = recipients.stream().filter(currentMembers::contains).toList();
        String url = (conversation.isChannel() ? "/channels/" : conversation.isGroup() ? "/groups/" : "/chats/") + message.conversationId();
        return subscriptions.findByUserIdInAndExpiresAtAfter(allowedRecipients, Instant.now()).stream().map(target -> new Delivery(target,
            new PushPayload("message.created", message.id(), message.conversationId(), target.getUserId(),
                message.sender().displayName(), "Новое сообщение", url, target.getExpiresAt()))).toList();
    }

    public void deliver(Delivery delivery) {
        var target = delivery.subscription();
        if (!subscriptions.existsByIdAndUserIdAndExpiresAtAfter(target.getId(), target.getUserId(), Instant.now())) return;
        try {
            if (transport.send(target, delivery.payload())) cleanup.removeInvalid(target.getId(), target.getUserId());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        } catch (Exception error) {
            // Endpoints, keys, payloads and provider error bodies are private; never include them in logs.
            log.warn("Web Push delivery failed ({})", error.getClass().getSimpleName());
        }
    }

    public record Delivery(WebPushSubscription subscription, PushPayload payload) {}
}
