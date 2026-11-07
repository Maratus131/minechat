package ru.msrpo.chat.conversation;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import java.util.*;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {
    @EntityGraph(attributePaths = {"firstUser", "secondUser"})
    Optional<Conversation> findByFirstUserIdAndSecondUserId(UUID first, UUID second);
    @EntityGraph(attributePaths = {"firstUser", "secondUser"})
    @Query("select c from Conversation c where c.firstUser.id = :viewer or c.secondUser.id = :viewer order by c.lastActivityAt desc, c.id desc")
    org.springframework.data.domain.Slice<Conversation> findForUser(UUID viewer, Pageable pageable);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Conversation c where c.id = :id")
    Optional<Conversation> lockById(UUID id);
}
