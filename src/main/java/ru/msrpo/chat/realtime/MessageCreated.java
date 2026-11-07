package ru.msrpo.chat.realtime;

import ru.msrpo.chat.message.MessageResponse;
import java.util.UUID;
import java.util.List;

public record MessageCreated(MessageResponse message, List<UUID> recipients) {
    public MessageCreated { recipients = List.copyOf(recipients); }
}
