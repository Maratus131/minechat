package ru.msrpo.chat.message;

import org.springframework.data.domain.Pageable;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.*;

public interface MessageRepository extends JpaRepository<Message, Long> {
    @EntityGraph(attributePaths = "sender")
    List<Message> findByConversationIdAndIdLessThanOrderByIdDesc(UUID conversationId, long beforeId, Pageable pageable);
    @EntityGraph(attributePaths = "sender")
    List<Message> findByConversationIdAndIdGreaterThanOrderByIdAsc(UUID conversationId, long afterId, Pageable pageable);
    @EntityGraph(attributePaths = "sender")
    List<Message> findByConversationIdAndIdIn(UUID conversationId, List<Long> ids);
    @EntityGraph(attributePaths = "sender")
    Optional<Message> findByIdAndConversationId(Long id, UUID conversationId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from Message m where m.id = :id and m.conversation.id = :conversationId")
    Optional<Message> lockByIdAndConversationId(Long id, UUID conversationId);
    Optional<Message> findFirstByConversationIdAndDeletedFalseOrderByIdDesc(UUID conversationId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<Message> findBySearchIndexedFalseOrderByIdAsc(Pageable pageable);
    @Modifying
    @Query("update Message m set m.searchIndexed = false")
    void resetIndexing();
}
