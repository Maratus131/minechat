package ru.msrpo.chat.attachment;

import java.util.UUID;

public record AttachmentResponse(UUID id, long messageId, String filename, long sizeBytes) {
    public static AttachmentResponse from(Attachment file) {
        return new AttachmentResponse(file.getId(), file.getMessage().getId(), file.getFilename(), file.getSizeBytes());
    }
}
