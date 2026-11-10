CREATE TABLE web_push_subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
    endpoint VARCHAR(2048) NOT NULL UNIQUE,
    p256dh VARCHAR(100) NOT NULL,
    auth VARCHAR(32) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX ix_web_push_subscriptions_user ON web_push_subscriptions(user_id, expires_at);
