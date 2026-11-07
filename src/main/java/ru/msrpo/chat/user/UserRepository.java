package ru.msrpo.chat.user;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import java.util.*;

public interface UserRepository extends JpaRepository<ChatUser, UUID> {
    Optional<ChatUser> findByUsername(String username);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from ChatUser u where u.id = :id")
    Optional<ChatUser> lockById(UUID id);
    @Query("select u from ChatUser u where u.enabled = true and u.id <> :exclude and u.username like :pattern escape '!' order by u.username")
    List<ChatUser> search(String pattern, UUID exclude, Pageable pageable);
}
