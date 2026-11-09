package ru.msrpo.chat.message;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import ru.msrpo.chat.attachment.*;
import ru.msrpo.chat.channel.ChannelSubscriptionRepository;
import ru.msrpo.chat.channel.ChannelRole;
import ru.msrpo.chat.common.*;
import ru.msrpo.chat.conversation.Conversation;
import ru.msrpo.chat.conversation.ConversationRepository;
import ru.msrpo.chat.conversation.ConversationService;
import ru.msrpo.chat.group.*;
import ru.msrpo.chat.realtime.*;
import ru.msrpo.chat.user.UserRepository;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class MessageService {
    private final MessageRepository messages;
    private final ConversationService conversations;
    private final UserRepository users;
    private final AttachmentService attachments;
    private final AttachmentRepository attachmentRepository;
    private final ApplicationEventPublisher events;
    private final ChannelSubscriptionRepository subscriptions;
    private final GroupMemberRepository groupMembers;
    private final ConversationRepository conversationRepository;

    @Transactional
    public MessageResponse send(UUID dialogId, UUID sender, String text, List<MultipartFile> files) {
        var conversation = conversations.lockForMember(dialogId, sender);
        String body = text == null ? "" : text.strip();
        var uploads = files == null ? List.<MultipartFile>of() : files;
        if (body.length() > 4096) throw ApiException.badRequest("Не более 4096 символов в сообщении");
        if (body.indexOf('\0') >= 0) throw ApiException.badRequest("Текст не должен содержать нулевой символ");
        if (body.isBlank() && uploads.isEmpty()) throw ApiException.badRequest("Добавьте текст или вложение");
        var message = messages.save(Message.create(conversation, users.getReferenceById(sender), body));
        var result = MessageResponse.from(message, attachments.save(message, uploads));
        conversation.recordMessage(message.getId(), body, message.getCreatedAt());
        events.publishEvent(new MessageCreated(result, recipients(conversation)));
        return result;
    }
    @Transactional
    public MessageResponse edit(UUID dialogId, long messageId, UUID viewer, String text) {
        var conversation = conversations.lockForMember(dialogId, viewer);
        var message = messages.lockByIdAndConversationId(messageId, dialogId).orElseThrow(ApiException::notFound);
        if (!message.getSender().getId().equals(viewer))
            throw new ApiException(HttpStatus.FORBIDDEN, "Редактировать можно только свои сообщения");
        if (message.isDeleted()) throw new ApiException(HttpStatus.CONFLICT, "Удалённое сообщение нельзя изменить");
        if (text == null) throw ApiException.badRequest("Укажите текст сообщения");
        String body = text.strip();
        if (text.length() > 4096) throw ApiException.badRequest("Не более 4096 символов в сообщении");
        if (body.indexOf('\0') >= 0) throw ApiException.badRequest("Текст не должен содержать нулевой символ");
        var files = attachmentRepository.metadata(List.of(messageId));
        if (body.isBlank() && files.isEmpty()) throw ApiException.badRequest("Добавьте текст или вложение");
        message.edit(body);
        if (Objects.equals(conversation.getLastMessageId(), messageId)) conversation.replaceLastMessage(messageId, body);
        var response = MessageResponse.from(message, files);
        events.publishEvent(new MessageUpdated(response, recipients(conversation)));
        return response;
    }
    @Transactional
    public MessageResponse delete(UUID dialogId, long messageId, UUID viewer) {
        conversations.requireMember(dialogId, viewer);
        var conversation = conversationRepository.lockById(dialogId).orElseThrow(ApiException::notFound);
        var message = messages.findByIdAndConversationId(messageId, dialogId).orElseThrow(ApiException::notFound);
        if (conversation.isChannel()) {
            var role = subscriptions.findByConversationIdAndUserId(dialogId, viewer)
                .map(subscription -> subscription.getRole()).orElse(null);
            if (role != ChannelRole.OWNER && role != ChannelRole.ADMIN) throw forbidden();
        } else if (conversation.isGroup()) {
            var role = groupMembers.findByConversationIdAndUserId(dialogId, viewer)
                .map(GroupMember::getRole).orElseThrow(ApiException::notFound);
            if (role == GroupRole.READER || (role == GroupRole.MEMBER && !message.getSender().getId().equals(viewer)))
                throw forbidden();
        } else if (!message.getSender().getId().equals(viewer)) throw forbidden();
        if (!message.isDeleted()) {
            attachmentRepository.deleteByMessageId(messageId);
            message.delete();
            if (Objects.equals(conversation.getLastMessageId(), messageId)) {
                var previous = messages.findFirstByConversationIdAndDeletedFalseOrderByIdDesc(dialogId);
                conversation.replaceLastMessage(previous.map(Message::getId).orElse(null),
                    previous.map(Message::getText).orElse(null));
            }
            events.publishEvent(new MessageDeleted(dialogId, messageId, recipients(conversation)));
        }
        return MessageResponse.from(message, List.of());
    }

    private List<UUID> recipients(Conversation conversation) {
        UUID id = conversation.getId();
        if (conversation.isChannel()) return subscriptions.findSubscriberIds(id);
        if (conversation.isGroup()) return groupMembers.findMemberIds(id);
        return List.of(conversation.getFirstUser().getId(), conversation.getSecondUser().getId());
    }
    private static ApiException forbidden() { return new ApiException(HttpStatus.FORBIDDEN, "Недостаточно прав для удаления сообщения"); }
    @Transactional(readOnly = true)
    public ItemsResponse<MessageResponse> history(UUID dialogId, UUID viewer, Long beforeId, Long afterId, int limit) {
        conversations.requireMember(dialogId, viewer);
        ItemsResponse.validateLimit(limit);
        if (beforeId != null && afterId != null) throw ApiException.badRequest("Используйте beforeId или afterId, не оба");
        if ((beforeId != null && beforeId < 1) || (afterId != null && afterId < 0)) throw ApiException.badRequest("Некорректный курсор");
        var page = PageRequest.of(0, limit + 1);
        var found = afterId != null ? messages.findByConversationIdAndIdGreaterThanOrderByIdAsc(dialogId, afterId, page)
            : messages.findByConversationIdAndIdLessThanOrderByIdDesc(dialogId, beforeId == null ? Long.MAX_VALUE : beforeId, page);
        return ItemsResponse.from(toResponses(found), limit);
    }
    public List<MessageResponse> toResponses(List<Message> found) {
        if (found.isEmpty()) return List.of();
        var metadata = attachmentRepository.metadata(found.stream().map(Message::getId).toList()).stream()
            .collect(Collectors.groupingBy(AttachmentResponse::messageId));
        return found.stream().map(message -> MessageResponse.from(message, metadata.getOrDefault(message.getId(), List.of()))).toList();
    }
}
