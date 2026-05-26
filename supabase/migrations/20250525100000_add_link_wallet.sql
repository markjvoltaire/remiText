-- Stripe Link wallet auth (per-user link-cli credentials JSON)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS link_auth_json text,
  ADD COLUMN IF NOT EXISTS link_connected_at timestamptz;

COMMENT ON COLUMN users.link_auth_json IS 'Serialized link-cli auth file for this user; never log in application logs';
COMMENT ON COLUMN users.link_connected_at IS 'When the user last successfully connected Stripe Link';
