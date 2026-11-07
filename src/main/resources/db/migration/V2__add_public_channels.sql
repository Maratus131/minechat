ALTER TABLE conversations ALTER COLUMN first_user_id DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN second_user_id DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN channel_username VARCHAR(32);
ALTER TABLE conversations ADD COLUMN channel_title VARCHAR(80);
ALTER TABLE conversations ADD COLUMN channel_description VARCHAR(500);
ALTER TABLE conversations ADD COLUMN channel_owner_id UUID REFERENCES chat_users(id);
ALTER TABLE conversations ADD CONSTRAINT uq_channel_username UNIQUE (channel_username);
ALTER TABLE conversations ADD CONSTRAINT ck_conversation_shape CHECK (
        (channel_username IS NULL AND channel_title IS NULL AND channel_description IS NULL
            AND channel_owner_id IS NULL AND first_user_id IS NOT NULL AND second_user_id IS NOT NULL)
        OR (channel_username IS NOT NULL AND channel_title IS NOT NULL AND channel_description IS NOT NULL
            AND channel_owner_id IS NOT NULL AND first_user_id IS NULL AND second_user_id IS NULL)
    );

CREATE INDEX ix_channels_owner ON conversations(channel_owner_id);
CREATE INDEX ix_channels_activity ON conversations(channel_username, last_activity_at DESC, id DESC);

CREATE TABLE channel_subscriptions (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    user_id UUID NOT NULL REFERENCES chat_users(id),
    CONSTRAINT uq_channel_subscription UNIQUE (conversation_id, user_id)
);
CREATE INDEX ix_channel_subscriptions_user ON channel_subscriptions(user_id, conversation_id);
