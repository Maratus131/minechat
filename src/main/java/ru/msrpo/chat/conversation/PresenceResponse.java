package ru.msrpo.chat.conversation;

import java.util.UUID;

public record PresenceResponse(UUID userId, boolean online) {}
