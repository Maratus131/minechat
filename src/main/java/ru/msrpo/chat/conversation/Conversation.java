package ru.msrpo.chat.conversation;

import jakarta.persistence.*;
import lombok.*;
import ru.msrpo.chat.user.ChatUser;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "conversations")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Conversation {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "first_user_id") private ChatUser firstUser;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "second_user_id") private ChatUser secondUser;
    @Column(length = 32) private String channelUsername;
    @Column(length = 80) private String channelTitle;
    @Column(length = 500) private String channelDescription;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "channel_owner_id") private ChatUser channelOwner;
    @Column(length = 80) private String groupTitle;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "group_owner_id") private ChatUser groupOwner;
    @Column(nullable = false) private Instant lastActivityAt;
    private Long lastMessageId;
    @Column(length = 4096) private String lastMessageText;
    @Version private Long version;
    public static Conversation create(ChatUser first, ChatUser second) {
        var dialog = new Conversation(); dialog.firstUser = first; dialog.secondUser = second; dialog.lastActivityAt = Instant.now(); return dialog;
    }
    public static Conversation createChannel(ChatUser owner, String username, String title, String description) {
        var channel = new Conversation();
        channel.channelOwner = owner; channel.channelUsername = username;
        channel.channelTitle = title; channel.channelDescription = description;
        channel.lastActivityAt = Instant.now();
        return channel;
    }
    public boolean isChannel() { return channelUsername != null; }
    public static Conversation createGroup(ChatUser owner, String title) {
        var group = new Conversation(); group.groupOwner = owner; group.groupTitle = title;
        group.lastActivityAt = Instant.now(); return group;
    }
    public boolean isGroup() { return groupTitle != null; }
    public boolean includes(UUID userId) {
        return !isChannel() && !isGroup() && (firstUser.getId().equals(userId) || secondUser.getId().equals(userId));
    }
    public void recordMessage(long id, String text, Instant at) {
        lastMessageId = id; lastMessageText = text; lastActivityAt = at;
    }
    public void clearLastMessageText() { lastMessageText = null; }
    public void replaceLastMessage(Long id, String text) {
        lastMessageId = id; lastMessageText = text;
    }
}
