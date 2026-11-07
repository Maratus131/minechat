package ru.msrpo.chat.user;

import io.swagger.v3.oas.annotations.Operation;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import ru.msrpo.chat.auth.ChatPrincipal;
import ru.msrpo.chat.common.ItemsResponse;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService users;
    @GetMapping("/me") @Operation(summary = "Мой профиль, включая приватную дату рождения")
    public ProfileResponse me(@AuthenticationPrincipal ChatPrincipal viewer) { return users.me(viewer.id()); }

    @PutMapping("/me") @Operation(summary = "Изменить отображаемое имя и дату рождения")
    public ProfileResponse update(@AuthenticationPrincipal ChatPrincipal viewer, @Valid @RequestBody UpdateProfileRequest request) {
        return users.update(viewer.id(), request);
    }

    @PutMapping(value = "/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Заменить аватар JPEG или PNG, не более 5 МиБ")
    public ProfileResponse uploadAvatar(@AuthenticationPrincipal ChatPrincipal viewer, @RequestPart("file") MultipartFile file) {
        return users.replaceAvatar(viewer.id(), file);
    }

    @DeleteMapping("/me/avatar") @Operation(summary = "Удалить свой аватар")
    public ProfileResponse deleteAvatar(@AuthenticationPrincipal ChatPrincipal viewer) { return users.deleteAvatar(viewer.id()); }

    @GetMapping("/{id}/avatar") @Operation(summary = "Получить аватар пользователя")
    public ResponseEntity<byte[]> avatar(@PathVariable UUID id) {
        var avatar = users.avatar(id);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(avatar.mimeType()))
            .header("X-Content-Type-Options", "nosniff").cacheControl(CacheControl.noStore())
            .contentLength(avatar.content().length).body(avatar.content());
    }

    @GetMapping @Operation(summary = "Поиск собеседника по началу логина (от 2 символов)")
    public ItemsResponse<UserResponse> search(@AuthenticationPrincipal ChatPrincipal viewer,
            @RequestParam String q, @RequestParam(defaultValue = "20") int limit) {
        return users.search(viewer.id(), q, limit);
    }
}
