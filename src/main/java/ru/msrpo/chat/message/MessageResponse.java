package ru.msrpo.chat.message;

import ru.msrpo.chat.attachment.AttachmentResponse;
import ru.msrpo.chat.user.UserResponse;
import java.time.Instant;
import java.util.*;

public record MessageResponse(long id, UUID conversationId, UserResponse sender, String text, Instant createdAt,
        boolean deleted,
        List<AttachmentResponse> attachments) {
    public static MessageResponse from(Message message, List<AttachmentResponse> attachments) {
        return new MessageResponse(message.getId(), message.getConversation().getId(), UserResponse.from(message.getSender()),
            message.getText(), message.getCreatedAt(), message.isDeleted(), message.isDeleted() ? List.of() : attachments);
    }
}
