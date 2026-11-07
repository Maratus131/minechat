package ru.msrpo.chat.conversation;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.common.*;
import ru.msrpo.chat.channel.*;
import ru.msrpo.chat.group.*;
import ru.msrpo.chat.user.UserRepository;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ConversationService {
    private final ConversationRepository conversations;
    private final UserRepository users;
    private final GroupMemberRepository groupMembers;
    private final ChannelSubscriptionRepository channelSubscriptions;
    @Transactional
    public ConversationResponse open(UUID viewer, UUID peer) {
        if (viewer.equals(peer)) throw ApiException.badRequest("Для диалога нужен другой пользователь");
        boolean viewerFirst = viewer.toString().compareTo(peer.toString()) < 0;
        UUID firstId = viewerFirst ? viewer : peer;
        UUID secondId = viewerFirst ? peer : viewer;
        // The same pair always takes the same lock, including simultaneous opens from both clients.
        var first = users.lockById(firstId).filter(user -> user.isEnabled()).orElseThrow(ApiException::notFound);
        var second = users.findById(secondId).filter(user -> user.isEnabled()).orElseThrow(ApiException::notFound);
        var dialog = conversations.findByFirstUserIdAndSecondUserId(firstId, secondId)
            .orElseGet(() -> conversations.save(Conversation.create(first, second)));
        return ConversationResponse.from(dialog, viewer);
    }
    public ItemsResponse<ConversationResponse> list(UUID viewer, int page, int limit) {
        ItemsResponse.validateLimit(limit);
        if (page < 0 || page > 10000) throw ApiException.badRequest("page должен быть от 0 до 10000");
        var result = conversations.findForUser(viewer, PageRequest.of(page, limit));
        return new ItemsResponse<>(result.stream().map(dialog -> ConversationResponse.from(dialog, viewer)).toList(), result.hasNext());
    }
    public Conversation requireMember(UUID dialogId, UUID viewer) {
        return conversations.findById(dialogId).filter(dialog -> dialog.isChannel()
            || (dialog.isGroup() && groupMembers.existsByConversationIdAndUserId(dialogId, viewer))
            || dialog.includes(viewer)).orElseThrow(ApiException::notFound);
    }
    @Transactional
    public Conversation lockForMember(UUID dialogId, UUID viewer) {
        var dialog = conversations.lockById(dialogId).orElseThrow(ApiException::notFound);
        if (dialog.isChannel()) {
            var role = channelSubscriptions.findByConversationIdAndUserId(dialogId, viewer)
                .map(ChannelSubscription::getRole).orElse(null);
            if (role != ChannelRole.OWNER && role != ChannelRole.ADMIN)
                throw new ApiException(HttpStatus.FORBIDDEN, "Публиковать может только администратор канала");
        } else if (dialog.isGroup()) {
            var role = groupMembers.findByConversationIdAndUserId(dialogId, viewer)
                .map(GroupMember::getRole).orElseThrow(ApiException::notFound);
            if (role == GroupRole.READER)
                throw new ApiException(HttpStatus.FORBIDDEN, "В этой группе доступно только чтение");
        } else if (!dialog.includes(viewer)) throw ApiException.notFound();
        return dialog;
    }
}
