package ru.msrpo.chat.attachment;

import org.springframework.data.jpa.repository.*;
import java.util.*;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {
    @Query("select new ru.msrpo.chat.attachment.AttachmentResponse(a.id, a.message.id, a.filename, a.sizeBytes) from Attachment a where a.message.id in :messageIds order by a.id")
    List<AttachmentResponse> metadata(List<Long> messageIds);
    @Query("select a.message.conversation.id from Attachment a where a.id = :id")
    Optional<UUID> conversationId(UUID id);
    void deleteByMessageId(Long messageId);
}
