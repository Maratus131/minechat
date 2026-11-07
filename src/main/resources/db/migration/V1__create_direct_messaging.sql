CREATE TABLE chat_users (
    id UUID PRIMARY KEY,
    username VARCHAR(32) NOT NULL UNIQUE,
    display_name VARCHAR(80) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    first_user_id UUID NOT NULL REFERENCES chat_users(id),
    second_user_id UUID NOT NULL REFERENCES chat_users(id),
    last_activity_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_message_id BIGINT,
    last_message_text VARCHAR(4096),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_conversation_pair UNIQUE (first_user_id, second_user_id),
    CONSTRAINT ck_distinct_members CHECK (first_user_id <> second_user_id)
);
CREATE INDEX ix_conversations_first ON conversations(first_user_id, last_activity_at DESC, id);
CREATE INDEX ix_conversations_second ON conversations(second_user_id, last_activity_at DESC, id);

CREATE SEQUENCE message_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE messages (
    id BIGINT PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    sender_id UUID NOT NULL REFERENCES chat_users(id),
    text VARCHAR(4096) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    search_indexed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_messages_conversation ON messages(conversation_id, id DESC);
CREATE INDEX ix_messages_sender ON messages(sender_id);
CREATE INDEX ix_messages_indexing ON messages(search_indexed, id);

CREATE TABLE attachments (
    id UUID PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id),
    filename VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
    content BYTEA NOT NULL
);
CREATE INDEX ix_attachments_message ON attachments(message_id);
