package ru.msrpo.chat.channel;

import jakarta.persistence.*;
import lombok.*;
import ru.msrpo.chat.conversation.Conversation;
import ru.msrpo.chat.user.ChatUser;
import java.util.UUID;

@Entity
@Table(name = "channel_subscriptions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChannelSubscription {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id", nullable = false) private Conversation conversation;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false) private ChatUser user;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private ChannelRole role;

    public static ChannelSubscription create(Conversation conversation, ChatUser user, ChannelRole role) {
        var subscription = new ChannelSubscription();
        subscription.conversation = conversation; subscription.user = user; subscription.role = role;
        return subscription;
    }
    public void changeRole(ChannelRole role) { this.role = role; }
}
