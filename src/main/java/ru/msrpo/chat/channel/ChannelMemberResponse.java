package ru.msrpo.chat.channel;

import ru.msrpo.chat.user.UserResponse;

public record ChannelMemberResponse(UserResponse user, ChannelRole role) {
    public static ChannelMemberResponse from(ChannelSubscription member) {
        return new ChannelMemberResponse(UserResponse.from(member.getUser()), member.getRole());
    }
}
