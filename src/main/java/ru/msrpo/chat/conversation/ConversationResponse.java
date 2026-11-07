package ru.msrpo.chat.conversation;

import ru.msrpo.chat.user.UserResponse;
import java.time.Instant;
import java.util.UUID;

public record ConversationResponse(UUID id, UserResponse peer, Long lastMessageId, String lastMessageText, Instant lastActivityAt) {
    public static ConversationResponse from(Conversation dialog, UUID viewer) {
        return new ConversationResponse(dialog.getId(), UserResponse.from(dialog.getFirstUser().getId().equals(viewer)
            ? dialog.getSecondUser() : dialog.getFirstUser()), dialog.getLastMessageId(), dialog.getLastMessageText(), dialog.getLastActivityAt());
    }
}
