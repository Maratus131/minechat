package ru.msrpo.chat.attachment;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import ru.msrpo.chat.auth.ChatPrincipal;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/attachments")
@RequiredArgsConstructor
public class AttachmentController {
    private final AttachmentService attachments;
    @GetMapping("/{id}") @Operation(summary = "Скачать вложение из диалога или публичного канала",
        description = "Личные вложения доступны участникам диалога; вложения публичного канала — всем авторизованным пользователям.")
    public ResponseEntity<byte[]> download(@PathVariable UUID id, @AuthenticationPrincipal ChatPrincipal viewer) {
        var file = attachments.download(id, viewer.id());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
            .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(file.filename(), StandardCharsets.UTF_8).build().toString())
            .header("X-Content-Type-Options", "nosniff").cacheControl(CacheControl.noStore())
            .contentLength(file.content().length).body(file.content());
    }
}
