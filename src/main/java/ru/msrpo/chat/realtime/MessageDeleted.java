package ru.msrpo.chat.realtime;

import java.util.*;

public record MessageDeleted(UUID conversationId, long messageId, List<UUID> recipients) {
    public MessageDeleted { recipients = List.copyOf(recipients); }
}
