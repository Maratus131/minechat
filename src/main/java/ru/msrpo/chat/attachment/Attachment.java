package ru.msrpo.chat.attachment;

import jakarta.persistence.*;
import lombok.*;
import ru.msrpo.chat.message.Message;
import java.util.UUID;

@Entity
@Table(name = "attachments")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Attachment {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "message_id") private Message message;
    @Column(nullable = false, length = 255) private String filename;
    @Column(nullable = false) private long sizeBytes;
    @Column(nullable = false, columnDefinition = "bytea") private byte[] content;
    public static Attachment create(Message message, String filename, byte[] content) {
        var file = new Attachment(); file.message = message; file.filename = filename; file.content = content;
        file.sizeBytes = content.length; return file;
    }
}
