package ru.msrpo.chat.user;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import ru.msrpo.chat.common.*;
import java.io.IOException;
import java.time.LocalDate;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {
    private static final int MAX_AVATAR_BYTES = 5 * 1024 * 1024;
    private final UserRepository users;
    private final UserAvatarRepository avatars;
    public record AvatarBytes(String mimeType, byte[] content) {}

    public ProfileResponse me(UUID id) { return ProfileResponse.from(users.findById(id).orElseThrow(ApiException::notFound)); }

    @Transactional
    public ProfileResponse update(UUID id, UpdateProfileRequest request) {
        String name = request.displayName().trim();
        if (name.isEmpty()) throw ApiException.badRequest("Введите отображаемое имя");
        LocalDate birthday = request.birthDate();
        LocalDate today = LocalDate.now();
        if (birthday != null && (birthday.isAfter(today) || birthday.isBefore(today.minusYears(130))))
            throw ApiException.badRequest("Укажите корректную дату рождения");
        var user = users.lockById(id).orElseThrow(ApiException::notFound);
        user.updateProfile(name, birthday);
        return ProfileResponse.from(user);
    }

    @Transactional
    public ProfileResponse replaceAvatar(UUID id, MultipartFile file) {
        var image = AvatarImageProcessor.process(readAvatar(file));
        var user = users.lockById(id).orElseThrow(ApiException::notFound);
        UUID previous = user.getAvatarId();
        var avatar = avatars.saveAndFlush(UserAvatar.create(image.mimeType(), image.content()));
        user.setAvatarId(avatar.getId());
        users.saveAndFlush(user);
        if (previous != null) avatars.deleteById(previous);
        return ProfileResponse.from(user);
    }

    @Transactional
    public ProfileResponse deleteAvatar(UUID id) {
        var user = users.lockById(id).orElseThrow(ApiException::notFound);
        UUID previous = user.getAvatarId();
        if (previous != null) {
            user.setAvatarId(null);
            users.saveAndFlush(user);
            avatars.deleteById(previous);
        }
        return ProfileResponse.from(user);
    }

    public AvatarBytes avatar(UUID id) {
        var user = users.findById(id).orElseThrow(ApiException::notFound);
        if (user.getAvatarId() == null) throw ApiException.notFound();
        var avatar = avatars.findById(user.getAvatarId()).orElseThrow(ApiException::notFound);
        return new AvatarBytes(avatar.getMimeType(), avatar.getContent());
    }

    private static byte[] readAvatar(MultipartFile file) {
        if (file.isEmpty()) throw ApiException.badRequest("Выберите изображение");
        if (file.getSize() > MAX_AVATAR_BYTES) throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "Аватар должен быть не больше 5 МиБ");
        try (var stream = file.getInputStream()) {
            byte[] content = stream.readNBytes(MAX_AVATAR_BYTES + 1);
            if (content.length > MAX_AVATAR_BYTES) throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "Аватар должен быть не больше 5 МиБ");
            return content;
        } catch (IOException error) {
            throw ApiException.badRequest("Не удалось прочитать изображение");
        }
    }

    public ItemsResponse<UserResponse> search(UUID viewer, String query, int limit) {
        ItemsResponse.validateLimit(limit);
        String prefix = query.trim().toLowerCase(Locale.ROOT);
        if (!prefix.matches("[a-z0-9_]{2,32}")) throw ApiException.badRequest("Введите от 2 до 32 символов логина: a-z, 0-9, _");
        // Escape the only permitted SQL LIKE metacharacter.
        return ItemsResponse.from(users.search(prefix.replace("_", "!_") + "%", viewer, PageRequest.of(0, limit + 1))
            .stream().map(UserResponse::from).toList(), limit);
    }
}
