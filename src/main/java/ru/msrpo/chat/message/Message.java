package ru.msrpo.chat.message;

import jakarta.persistence.*;
import lombok.*;
import ru.msrpo.chat.conversation.Conversation;
import ru.msrpo.chat.user.ChatUser;
import java.time.Instant;

@Entity
@Table(name = "messages")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Message {
    @Id @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "message_ids")
    @SequenceGenerator(name = "message_ids", sequenceName = "message_seq", allocationSize = 1)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "conversation_id") private Conversation conversation;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "sender_id") private ChatUser sender;
    @Column(nullable = false, length = 4096) private String text;
    @Column(nullable = false) private Instant createdAt;
    private Instant editedAt;
    @Column(nullable = false) private boolean searchIndexed;
    @Column(nullable = false) private boolean deleted;
    public static Message create(Conversation conversation, ChatUser sender, String text) {
        var message = new Message(); message.conversation = conversation; message.sender = sender;
        message.text = text; message.createdAt = Instant.now(); return message;
    }
    public void markIndexed() { searchIndexed = true; }
    public void edit(String text) { this.text = text; editedAt = Instant.now(); searchIndexed = false; }
    public void delete() { deleted = true; text = ""; searchIndexed = false; }
}
