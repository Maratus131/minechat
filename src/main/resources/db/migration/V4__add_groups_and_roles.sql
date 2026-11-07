ALTER TABLE conversations ADD COLUMN group_title VARCHAR(80);
ALTER TABLE conversations ADD COLUMN group_owner_id UUID REFERENCES chat_users(id);
ALTER TABLE conversations DROP CONSTRAINT ck_conversation_shape;
ALTER TABLE conversations ADD CONSTRAINT ck_conversation_shape CHECK (
    (first_user_id IS NOT NULL AND second_user_id IS NOT NULL AND channel_username IS NULL AND channel_title IS NULL AND channel_description IS NULL AND channel_owner_id IS NULL AND group_title IS NULL AND group_owner_id IS NULL)
    OR (first_user_id IS NULL AND second_user_id IS NULL AND channel_username IS NOT NULL AND channel_title IS NOT NULL AND channel_description IS NOT NULL AND channel_owner_id IS NOT NULL AND group_title IS NULL AND group_owner_id IS NULL)
    OR (first_user_id IS NULL AND second_user_id IS NULL AND channel_username IS NULL AND channel_title IS NULL AND channel_description IS NULL AND channel_owner_id IS NULL AND group_title IS NOT NULL AND group_owner_id IS NOT NULL)
);
CREATE TABLE group_members (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    user_id UUID NOT NULL REFERENCES chat_users(id),
    role VARCHAR(16) NOT NULL CHECK (role IN ('OWNER','ADMIN','MEMBER','READER')),
    CONSTRAINT uq_group_member UNIQUE (conversation_id,user_id)
);
CREATE INDEX ix_group_members_user ON group_members(user_id,conversation_id);
ALTER TABLE channel_subscriptions ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'SUBSCRIBER' CHECK (role IN ('OWNER','ADMIN','SUBSCRIBER'));
UPDATE channel_subscriptions s SET role='OWNER' FROM conversations c WHERE s.conversation_id=c.id AND s.user_id=c.channel_owner_id;
ALTER TABLE messages ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE;
