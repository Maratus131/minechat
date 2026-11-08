package ru.msrpo.chat.conversation;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.common.ApiException;
import ru.msrpo.chat.realtime.EventService;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PresenceService {
    private final ConversationService conversations;
    private final EventService events;

    public PresenceResponse peer(UUID conversationId, UUID viewer) {
        var dialog = conversations.requireMember(conversationId, viewer);
        if (dialog.isChannel() || dialog.isGroup()) throw ApiException.notFound();
        UUID peer = dialog.getFirstUser().getId().equals(viewer)
            ? dialog.getSecondUser().getId() : dialog.getFirstUser().getId();
        return new PresenceResponse(peer, events.isOnline(peer));
    }
}
