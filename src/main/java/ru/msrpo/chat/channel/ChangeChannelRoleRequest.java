package ru.msrpo.chat.channel;

import jakarta.validation.constraints.NotNull;

public record ChangeChannelRoleRequest(@NotNull ChannelRole role) {}
