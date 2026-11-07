package ru.msrpo.chat.channel;

import jakarta.validation.constraints.*;

public record CreateChannelRequest(
        @NotNull @Pattern(regexp = "[a-zA-Z0-9_]{3,32}") String username,
        @NotBlank @Size(max = 80) String title,
        @Size(max = 500) String description) {
    public CreateChannelRequest {
        if (username != null) username = username.strip();
        if (title != null) title = title.strip();
        description = description == null ? "" : description.strip();
    }
}
