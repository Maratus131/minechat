package ru.msrpo.chat.group;

import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import java.util.*;

public interface GroupMemberRepository extends JpaRepository<GroupMember, UUID> {
    @EntityGraph(attributePaths = "user")
    Optional<GroupMember> findByConversationIdAndUserId(UUID conversationId, UUID userId);
    boolean existsByConversationIdAndUserId(UUID conversationId, UUID userId);
    long countByConversationId(UUID conversationId);
    @EntityGraph(attributePaths = "user")
    Slice<GroupMember> findByConversationIdOrderByUserUsername(UUID conversationId, Pageable pageable);
    @Query("select m.user.id from GroupMember m where m.conversation.id = :conversationId")
    List<UUID> findMemberIds(UUID conversationId);
    @EntityGraph(attributePaths = {"conversation", "conversation.groupOwner"})
    @Query("select m from GroupMember m where m.user.id = :viewer order by m.conversation.lastActivityAt desc, m.conversation.id desc")
    Slice<GroupMember> findForViewer(UUID viewer, Pageable pageable);
    interface MemberCount { UUID getGroupId(); long getTotal(); }
    @Query("select m.conversation.id as groupId, count(m) as total from GroupMember m where m.conversation.id in :ids group by m.conversation.id")
    List<MemberCount> countForGroups(Collection<UUID> ids);
    void deleteByConversationIdAndUserId(UUID conversationId, UUID userId);
}
