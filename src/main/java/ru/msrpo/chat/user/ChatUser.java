package ru.msrpo.chat.user;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "chat_users")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ChatUser {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(nullable = false, unique = true, length = 32) private String username;
    @Column(nullable = false, length = 80) private String displayName;
    @Column private LocalDate birthDate;
    @Column private UUID avatarId;
    @Column(nullable = false, length = 100) private String passwordHash;
    @Column(nullable = false) private boolean enabled = true;

    public static ChatUser create(String username, String displayName, String passwordHash) {
        var user = new ChatUser();
        user.username = username; user.displayName = displayName; user.passwordHash = passwordHash;
        return user;
    }

    public void updateProfile(String displayName, LocalDate birthDate) {
        this.displayName = displayName;
        this.birthDate = birthDate;
    }

    public void setAvatarId(UUID avatarId) { this.avatarId = avatarId; }
}
