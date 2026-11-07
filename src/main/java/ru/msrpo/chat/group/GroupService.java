package ru.msrpo.chat.group;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.msrpo.chat.common.*;
import ru.msrpo.chat.conversation.*;
import ru.msrpo.chat.user.*;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GroupService {
    private final ConversationRepository conversations;
    private final GroupMemberRepository members;
    private final UserRepository users;

    @Transactional
    public GroupResponse create(UUID viewer, CreateGroupRequest request) {
        String title = request.title().strip();
        if (title.indexOf('\0') >= 0) throw ApiException.badRequest("Название содержит недопустимый символ");
        var owner = activeUser(viewer);
        var ids = new LinkedHashSet<>(request.memberIds());
        if (ids.contains(viewer) || ids.size() != request.memberIds().size())
            throw ApiException.badRequest("Участники не должны повторяться и содержать владельца");
        var group = conversations.save(Conversation.createGroup(owner, title));
        members.save(GroupMember.create(group, owner, GroupRole.OWNER));
        for (UUID id : ids) members.save(GroupMember.create(group, activeUser(id), GroupRole.MEMBER));
        return GroupResponse.from(group, GroupRole.OWNER, ids.size() + 1);
    }

    public ItemsResponse<GroupResponse> list(UUID viewer, int page, int limit) {
        ItemsResponse.validateLimit(limit);
        if (page < 0 || page > 10000) throw ApiException.badRequest("Некорректная страница");
        var found = members.findForViewer(viewer, PageRequest.of(page, limit));
        var ids = found.stream().map(member -> member.getConversation().getId()).toList();
        if (ids.isEmpty()) return new ItemsResponse<>(List.of(), false);
        var counts = members.countForGroups(ids).stream().collect(Collectors.toMap(
            GroupMemberRepository.MemberCount::getGroupId, GroupMemberRepository.MemberCount::getTotal));
        return new ItemsResponse<>(found.stream().map(member -> GroupResponse.from(member.getConversation(),
            member.getRole(), counts.getOrDefault(member.getConversation().getId(), 0L))).toList(), found.hasNext());
    }

    public GroupResponse get(UUID id, UUID viewer) {
        var group = requireGroup(id);
        var role = requireMember(id, viewer).getRole();
        return GroupResponse.from(group, role, members.countByConversationId(id));
    }

    public ItemsResponse<GroupMemberResponse> listMembers(UUID id, UUID viewer, int page, int limit) {
        requireMember(id, viewer);
        ItemsResponse.validateLimit(limit);
        if (page < 0 || page > 10000) throw ApiException.badRequest("Некорректная страница");
        var found = members.findByConversationIdOrderByUserUsername(id, PageRequest.of(page, limit));
        return new ItemsResponse<>(found.stream().map(GroupMemberResponse::from).toList(), found.hasNext());
    }

    @Transactional
    public GroupMemberResponse add(UUID id, UUID viewer, AddGroupMemberRequest request) {
        lockGroup(id);
        GroupRole actor = requireMember(id, viewer).getRole();
        requireManager(actor);
        if (request.role() != GroupRole.MEMBER && request.role() != GroupRole.READER)
            throw ApiException.badRequest("Добавить можно участника или читателя");
        if (members.existsByConversationIdAndUserId(id, request.userId()))
            throw new ApiException(HttpStatus.CONFLICT, "Пользователь уже состоит в группе");
        var member = members.save(GroupMember.create(requireGroup(id), activeUser(request.userId()), request.role()));
        return GroupMemberResponse.from(member);
    }

    @Transactional
    public GroupMemberResponse changeRole(UUID id, UUID viewer, UUID userId, ChangeGroupRoleRequest request) {
        lockGroup(id);
        GroupRole actor = requireMember(id, viewer).getRole();
        requireManager(actor);
        var member = requireMember(id, userId);
        if (member.getRole() == GroupRole.OWNER || request.role() == GroupRole.OWNER)
            throw forbidden("Роль владельца нельзя изменить");
        if (actor == GroupRole.ADMIN && (member.getRole() == GroupRole.ADMIN || request.role() == GroupRole.ADMIN))
            throw forbidden("Только владелец управляет администраторами");
        member.changeRole(request.role());
        return GroupMemberResponse.from(member);
    }

    @Transactional
    public void remove(UUID id, UUID viewer, UUID userId) {
        lockGroup(id);
        var member = requireMember(id, userId);
        if (member.getRole() == GroupRole.OWNER) throw forbidden("Владелец не может покинуть группу");
        if (!viewer.equals(userId)) {
            GroupRole actor = requireMember(id, viewer).getRole();
            requireManager(actor);
            if (actor == GroupRole.ADMIN && member.getRole() == GroupRole.ADMIN)
                throw forbidden("Администратор не может удалить другого администратора");
        }
        members.delete(member);
    }

    public GroupMember requireMember(UUID id, UUID viewer) {
        return members.findByConversationIdAndUserId(id, viewer).orElseThrow(ApiException::notFound);
    }
    public List<UUID> memberIds(UUID id) { return members.findMemberIds(id); }
    private Conversation requireGroup(UUID id) {
        return conversations.findById(id).filter(Conversation::isGroup).orElseThrow(ApiException::notFound);
    }
    private void lockGroup(UUID id) {
        conversations.lockById(id).filter(Conversation::isGroup).orElseThrow(ApiException::notFound);
    }
    private ChatUser activeUser(UUID id) { return users.findById(id).filter(ChatUser::isEnabled).orElseThrow(ApiException::notFound); }
    private static void requireManager(GroupRole role) {
        if (role != GroupRole.OWNER && role != GroupRole.ADMIN) throw forbidden("Недостаточно прав для управления участниками");
    }
    private static ApiException forbidden(String message) { return new ApiException(HttpStatus.FORBIDDEN, message); }
}
