package ru.msrpo.chat.realtime;

import ru.msrpo.chat.message.MessageResponse;
import java.util.List;
import java.util.UUID;

public record MessageUpdated(MessageResponse message, List<UUID> recipients) {
    public MessageUpdated { recipients = List.copyOf(recipients); }
}
