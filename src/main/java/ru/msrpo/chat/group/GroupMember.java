package ru.msrpo.chat.group;

import jakarta.persistence.*;
import lombok.*;
import ru.msrpo.chat.conversation.Conversation;
import ru.msrpo.chat.user.ChatUser;
import java.util.UUID;

@Entity
@Table(name = "group_members")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupMember {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "conversation_id") private Conversation conversation;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id") private ChatUser user;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private GroupRole role;
    public static GroupMember create(Conversation conversation, ChatUser user, GroupRole role) {
        var member = new GroupMember(); member.conversation = conversation; member.user = user; member.role = role; return member;
    }
    public void changeRole(GroupRole role) { this.role = role; }
}
