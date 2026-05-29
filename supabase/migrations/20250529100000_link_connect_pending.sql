-- Track in-flight Link wallet connection (verification URL sent, awaiting user approval)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS link_connect_started_at timestamptz;

COMMENT ON COLUMN users.link_connect_started_at IS 'Set when link_connect issued a verification URL; cleared on successful auth';
