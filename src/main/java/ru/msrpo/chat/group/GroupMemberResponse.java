package ru.msrpo.chat.group;

import ru.msrpo.chat.user.UserResponse;

public record GroupMemberResponse(UserResponse user, GroupRole role) {
    public static GroupMemberResponse from(GroupMember member) {
        return new GroupMemberResponse(UserResponse.from(member.getUser()), member.getRole());
    }
}
