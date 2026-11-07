package ru.msrpo.chat.user;

import java.util.UUID;

public record UserResponse(UUID id, String username, String displayName, UUID avatarId) {
    public static UserResponse from(ChatUser user) { return new UserResponse(user.getId(), user.getUsername(), user.getDisplayName(), user.getAvatarId()); }
}
