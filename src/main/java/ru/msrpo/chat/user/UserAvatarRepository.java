package ru.msrpo.chat.user;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface UserAvatarRepository extends JpaRepository<UserAvatar, UUID> {}
