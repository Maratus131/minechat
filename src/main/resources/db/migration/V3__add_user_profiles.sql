CREATE TABLE user_avatars (
    id UUID PRIMARY KEY,
    mime_type VARCHAR(10) NOT NULL,
    content BYTEA NOT NULL,
    CONSTRAINT ck_avatar_mime CHECK (mime_type IN ('image/jpeg', 'image/png')),
    CONSTRAINT ck_avatar_size CHECK (octet_length(content) BETWEEN 1 AND 5242880)
);

ALTER TABLE chat_users ADD COLUMN birth_date DATE;
ALTER TABLE chat_users ADD COLUMN avatar_id UUID UNIQUE REFERENCES user_avatars(id);
