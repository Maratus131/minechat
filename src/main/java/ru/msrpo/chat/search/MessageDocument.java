package ru.msrpo.chat.search;

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.*;
import ru.msrpo.chat.message.Message;

@Document(indexName = "chat-messages-v1", createIndex = false)
public record MessageDocument(@Id String id, @Field(type = FieldType.Long) long messageId, @Field(type = FieldType.Keyword) String conversationId,
        @Field(type = FieldType.Text, analyzer = "standard") String text) {
    public static MessageDocument from(Message message) {
        return new MessageDocument(message.getId().toString(), message.getId(), message.getConversation().getId().toString(), message.getText());
    }
}
