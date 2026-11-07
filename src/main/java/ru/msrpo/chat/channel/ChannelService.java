package ru.msrpo.chat.channel;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.common.*;
import ru.msrpo.chat.conversation.*;
import ru.msrpo.chat.user.UserRepository;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ChannelService {
    private final ChannelRepository channels;
    private final ChannelSubscriptionRepository subscriptions;
    private final ConversationRepository conversations;
    private final UserRepository users;

    @Transactional
    public ChannelResponse create(UUID viewer, CreateChannelRequest request) {
        String username = request.username().toLowerCase(Locale.ROOT);
        if (request.title().indexOf('\0') >= 0 || request.description().indexOf('\0') >= 0)
            throw ApiException.badRequest("Название и описание не должны содержать нулевой символ");
        if (channels.existsByChannelUsername(username)) throw usernameConflict();
        var owner = users.findById(viewer).filter(user -> user.isEnabled()).orElseThrow(ApiException::notFound);
        final Conversation channel;
        try {
            channel = channels.saveAndFlush(Conversation.createChannel(owner, username, request.title(), request.description()));
        } catch (DataIntegrityViolationException error) {
            // A concurrent creation can take this username after the existence check.
            throw usernameConflict();
        }
        subscriptions.save(ChannelSubscription.create(channel, owner, ChannelRole.OWNER));
        return ChannelResponse.from(channel, ChannelRole.OWNER, 1);
    }

    public ItemsResponse<ChannelResponse> list(UUID viewer, int page, int limit) {
        return responses(channels.findSubscriptions(viewer, pageable(page, limit)), viewer);
    }

    public ItemsResponse<ChannelResponse> search(UUID viewer, String query, int page, int limit) {
        var paging = pageable(page, limit);
        String text = query.strip().toLowerCase(Locale.ROOT);
        if (text.length() < 2 || text.length() > 100 || text.indexOf('\0') >= 0)
            throw ApiException.badRequest("Поисковая строка: от 2 до 100 символов");
        String pattern = "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        return responses(channels.search(pattern, paging), viewer);
    }

    public ChannelResponse get(UUID id, UUID viewer) {
        var channel = channels.findByIdAndChannelUsernameIsNotNull(id).orElseThrow(ApiException::notFound);
        return response(channel, viewer);
    }

    @Transactional
    public ChannelResponse subscribe(UUID id, UUID viewer) {
        var channel = lockChannel(id);
        if (!subscriptions.existsByConversationIdAndUserId(id, viewer)) {
            var user = users.findById(viewer).filter(candidate -> candidate.isEnabled()).orElseThrow(ApiException::notFound);
            subscriptions.save(ChannelSubscription.create(channel, user, ChannelRole.SUBSCRIBER));
        }
        return response(channel, viewer);
    }

    @Transactional
    public ChannelResponse unsubscribe(UUID id, UUID viewer) {
        var channel = lockChannel(id);
        if (channel.getChannelOwner().getId().equals(viewer))
            throw new ApiException(HttpStatus.FORBIDDEN, "Владелец не может отписаться от своего канала");
        subscriptions.deleteByConversationIdAndUserId(id, viewer);
        return response(channel, viewer);
    }

    public ItemsResponse<ChannelMemberResponse> listMembers(UUID id, UUID viewer, int page, int limit) {
        locklessChannel(id);
        var role = viewerRole(id, viewer);
        if (role == null) throw ApiException.notFound();
        if (role == ChannelRole.SUBSCRIBER)
            throw new ApiException(HttpStatus.FORBIDDEN, "Список подписчиков доступен администраторам канала");
        var paging = pageable(page, limit);
        var result = subscriptions.findByConversationIdOrderByUserUsername(id, paging);
        return new ItemsResponse<>(result.stream().map(ChannelMemberResponse::from).toList(), result.hasNext());
    }

    @Transactional
    public ChannelMemberResponse changeRole(UUID id, UUID viewer, UUID userId, ChangeChannelRoleRequest request) {
        var channel = lockChannel(id);
        if (!channel.getChannelOwner().getId().equals(viewer))
            throw new ApiException(HttpStatus.FORBIDDEN, "Ролями канала управляет владелец");
        if (request.role() == ChannelRole.OWNER || userId.equals(viewer))
            throw new ApiException(HttpStatus.FORBIDDEN, "Роль владельца нельзя изменить");
        var member = subscriptions.findByConversationIdAndUserId(id, userId).orElseThrow(ApiException::notFound);
        member.changeRole(request.role());
        return ChannelMemberResponse.from(member);
    }

    public ChannelRole viewerRole(UUID id, UUID viewer) {
        return subscriptions.findByConversationIdAndUserId(id, viewer).map(ChannelSubscription::getRole).orElse(null);
    }

    private Conversation locklessChannel(UUID id) {
        return channels.findByIdAndChannelUsernameIsNotNull(id).orElseThrow(ApiException::notFound);
    }

    private Conversation lockChannel(UUID id) {
        return conversations.lockById(id).filter(Conversation::isChannel).orElseThrow(ApiException::notFound);
    }

    private ChannelResponse response(Conversation channel, UUID viewer) {
        return ChannelResponse.from(channel, viewerRole(channel.getId(), viewer),
            subscriptions.countByConversationId(channel.getId()));
    }

    private ItemsResponse<ChannelResponse> responses(Slice<Conversation> slice, UUID viewer) {
        var ids = slice.stream().map(Conversation::getId).toList();
        if (ids.isEmpty()) return new ItemsResponse<>(List.of(), false);
        var counts = subscriptions.countForChannels(ids).stream().collect(Collectors.toMap(
            ChannelSubscriptionRepository.SubscriberCount::getChannelId,
            ChannelSubscriptionRepository.SubscriberCount::getTotal));
        var roles = subscriptions.findViewerSubscriptions(viewer, ids).stream().collect(Collectors.toMap(
            subscription -> subscription.getConversation().getId(), ChannelSubscription::getRole));
        return new ItemsResponse<>(slice.stream().map(channel -> ChannelResponse.from(channel,
            roles.get(channel.getId()), counts.getOrDefault(channel.getId(), 0L))).toList(), slice.hasNext());
    }

    private static Pageable pageable(int page, int limit) {
        ItemsResponse.validateLimit(limit);
        if (page < 0 || page > 10000) throw ApiException.badRequest("page должен быть от 0 до 10000");
        return PageRequest.of(page, limit);
    }

    private static ApiException usernameConflict() {
        return new ApiException(HttpStatus.CONFLICT, "Это имя канала уже занято");
    }
}
