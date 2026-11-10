package ru.msrpo.chat.notification;

import java.time.Instant;
import java.util.UUID;

public record PushPayload(String type, long messageId, UUID conversationId, UUID recipientId,
                          String title, String body, String url, Instant expiresAt) {}
