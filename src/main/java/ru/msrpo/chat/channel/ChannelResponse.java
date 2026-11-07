package ru.msrpo.chat.channel;

import ru.msrpo.chat.conversation.Conversation;
import ru.msrpo.chat.user.UserResponse;
import java.time.Instant;
import java.util.UUID;

public record ChannelResponse(UUID id, String username, String title, String description,
        UserResponse owner, boolean subscribed, ChannelRole viewerRole, long subscriberCount, Long lastMessageId,
        String lastMessageText, Instant lastActivityAt) {
    public static ChannelResponse from(Conversation channel, ChannelRole viewerRole, long subscriberCount) {
        return new ChannelResponse(channel.getId(), channel.getChannelUsername(), channel.getChannelTitle(),
            channel.getChannelDescription(), UserResponse.from(channel.getChannelOwner()), viewerRole != null, viewerRole,
            subscriberCount, channel.getLastMessageId(), channel.getLastMessageText(), channel.getLastActivityAt());
    }
}
