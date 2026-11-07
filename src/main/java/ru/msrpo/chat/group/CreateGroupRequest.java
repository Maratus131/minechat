package ru.msrpo.chat.group;

import jakarta.validation.constraints.*;
import java.util.*;

public record CreateGroupRequest(@NotBlank @Size(max = 80) String title,
        @NotNull @Size(max = 100) List<@NotNull UUID> memberIds) {}
