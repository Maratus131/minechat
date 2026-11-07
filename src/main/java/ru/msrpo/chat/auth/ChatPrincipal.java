package ru.msrpo.chat.auth;

import java.time.Instant;
import java.util.UUID;

public record ChatPrincipal(UUID id, Instant expiresAt) {}
