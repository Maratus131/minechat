package ru.msrpo.chat.user;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.util.UUID;

@Entity
@Table(name = "user_avatars")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserAvatar {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(nullable = false, length = 10) private String mimeType;
    @Column(nullable = false, columnDefinition = "bytea") private byte[] content;

    public static UserAvatar create(String mimeType, byte[] content) {
        var avatar = new UserAvatar();
        avatar.mimeType = mimeType;
        avatar.content = content;
        return avatar;
    }
}
