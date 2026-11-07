package ru.msrpo.chat.channel;

import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import ru.msrpo.chat.conversation.Conversation;
import java.util.*;

public interface ChannelRepository extends JpaRepository<Conversation, UUID> {
    boolean existsByChannelUsername(String username);

    @EntityGraph(attributePaths = "channelOwner")
    Optional<Conversation> findByIdAndChannelUsernameIsNotNull(UUID id);

    @EntityGraph(attributePaths = "channelOwner")
    @Query("select c from Conversation c where c.channelUsername is not null and exists (select s.id from ChannelSubscription s where s.conversation = c and s.user.id = :viewer) order by c.lastActivityAt desc, c.id desc")
    Slice<Conversation> findSubscriptions(UUID viewer, Pageable pageable);

    @EntityGraph(attributePaths = "channelOwner")
    @Query("select c from Conversation c where c.channelUsername is not null and (lower(c.channelTitle) like :pattern escape '!' or c.channelUsername like :pattern escape '!') order by c.lastActivityAt desc, c.id desc")
    Slice<Conversation> search(String pattern, Pageable pageable);
}
