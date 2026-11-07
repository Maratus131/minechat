package ru.msrpo.chat.group;

import jakarta.validation.constraints.NotNull;

public record ChangeGroupRoleRequest(@NotNull GroupRole role) {}
