package ru.msrpo.chat.attachment;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import ru.msrpo.chat.common.ApiException;
import ru.msrpo.chat.conversation.ConversationService;
import ru.msrpo.chat.message.Message;
import java.io.IOException;
import java.util.*;

@Service
@RequiredArgsConstructor
public class AttachmentService {
    public static final long MAX_BYTES = 10 * 1024 * 1024;
    private final AttachmentRepository attachments;
    private final ConversationService conversations;
    public record Download(String filename, byte[] content) {}

    @Transactional
    public List<AttachmentResponse> save(Message message, List<MultipartFile> files) {
        if (files.size() > 5) throw ApiException.badRequest("Не более 5 файлов в сообщении");
        return files.stream().map(file -> {
            if (file.isEmpty()) throw ApiException.badRequest("Пустой файл");
            if (file.getSize() > MAX_BYTES) throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "Размер файла превышает 10 МБ");
            try {
                // Bounded reading also protects callers other than the servlet multipart resolver.
                byte[] content;
                try (var input = file.getInputStream()) { content = input.readNBytes((int) MAX_BYTES + 1); }
                if (content.length > MAX_BYTES) throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "Размер файла превышает 10 МБ");
                return AttachmentResponse.from(attachments.save(Attachment.create(message, safeFilename(file.getOriginalFilename()), content)));
            } catch (IOException error) { throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Не удалось прочитать вложение"); }
        }).toList();
    }
    @Transactional(readOnly = true)
    public Download download(UUID id, UUID viewer) {
        conversations.requireMember(attachments.conversationId(id).orElseThrow(ApiException::notFound), viewer);
        var file = attachments.findById(id).orElseThrow(ApiException::notFound);
        return new Download(file.getFilename(), file.getContent());
    }
    static String safeFilename(String original) {
        String name = original == null ? "file" : original.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "_").trim();
        if (name.isBlank() || name.equals(".") || name.equals("..")) name = "file";
        return name.substring(0, Math.min(name.length(), 255));
    }
}
