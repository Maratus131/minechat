package ru.msrpo.chat.user;

import java.time.LocalDate;
import java.util.UUID;

public record ProfileResponse(UUID id, String username, String displayName, UUID avatarId, LocalDate birthDate) {
    public static ProfileResponse from(ChatUser user) {
        return new ProfileResponse(user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarId(), user.getBirthDate());
    }
}
