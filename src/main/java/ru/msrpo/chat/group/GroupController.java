package ru.msrpo.chat.group;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ItemsResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/groups")
@RequiredArgsConstructor
public class GroupController {
    private final GroupService groups;

    @GetMapping @Operation(summary = "Мои групповые чаты")
    public ItemsResponse<GroupResponse> list(@AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "30") int limit) {
        return groups.list(viewer.id(), page, limit);
    }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Operation(summary = "Создать групповой чат")
    public GroupResponse create(@AuthenticationPrincipal ChatPrincipal viewer, @Valid @RequestBody CreateGroupRequest request) {
        return groups.create(viewer.id(), request);
    }
    @GetMapping("/{id}") @Operation(summary = "Открыть групповой чат")
    public GroupResponse get(@PathVariable UUID id, @AuthenticationPrincipal ChatPrincipal viewer) {
        return groups.get(id, viewer.id());
    }
    @GetMapping("/{id}/members") @Operation(summary = "Участники группы")
    public ItemsResponse<GroupMemberResponse> members(@PathVariable UUID id, @AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "100") int limit) {
        return groups.listMembers(id, viewer.id(), page, limit);
    }
    @PostMapping("/{id}/members") @ResponseStatus(HttpStatus.CREATED) @Operation(summary = "Добавить участника")
    public GroupMemberResponse add(@PathVariable UUID id, @AuthenticationPrincipal ChatPrincipal viewer,
            @Valid @RequestBody AddGroupMemberRequest request) {
        return groups.add(id, viewer.id(), request);
    }
    @PutMapping("/{id}/members/{userId}") @Operation(summary = "Изменить роль участника")
    public GroupMemberResponse changeRole(@PathVariable UUID id, @PathVariable UUID userId,
            @AuthenticationPrincipal ChatPrincipal viewer, @Valid @RequestBody ChangeGroupRoleRequest request) {
        return groups.changeRole(id, viewer.id(), userId, request);
    }
    @DeleteMapping("/{id}/members/{userId}") @ResponseStatus(HttpStatus.NO_CONTENT) @Operation(summary = "Удалить участника или покинуть группу")
    public void remove(@PathVariable UUID id, @PathVariable UUID userId, @AuthenticationPrincipal ChatPrincipal viewer) {
        groups.remove(id, viewer.id(), userId);
    }
}
