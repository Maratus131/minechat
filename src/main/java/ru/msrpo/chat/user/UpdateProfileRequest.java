package ru.msrpo.chat.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record UpdateProfileRequest(
    @NotBlank @Size(max = 80) @Pattern(regexp = "[^\\x00]*") String displayName,
    LocalDate birthDate
) {}
