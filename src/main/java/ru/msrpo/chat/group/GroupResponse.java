package ru.msrpo.chat.group;

import ru.msrpo.chat.conversation.Conversation;
import ru.msrpo.chat.user.UserResponse;
import java.time.Instant;
import java.util.UUID;

public record GroupResponse(UUID id, String title, UserResponse owner, GroupRole viewerRole,
        long memberCount, Long lastMessageId, String lastMessageText, Instant lastActivityAt) {
    public static GroupResponse from(Conversation group, GroupRole role, long count) {
        return new GroupResponse(group.getId(), group.getGroupTitle(), UserResponse.from(group.getGroupOwner()),
            role, count, group.getLastMessageId(), group.getLastMessageText(), group.getLastActivityAt());
    }
}
