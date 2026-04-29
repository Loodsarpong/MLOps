-- 0010_user_passwords.sql — real password storage and brute-force lockout.
--
-- Replaces the dev-only AuthService backdoor that accepted any user with the
-- string 'dev-password'. After this migration:
--   - users.password_hash holds an argon2id hash (NULL = invited / not yet
--     activated; login is rejected for those rows)
--   - users.must_change_password forces the holder to set a new password on
--     next login (admin-set temp passwords + new invites land here)
--   - failed_login_count + locked_until implement a 5-strikes-15-min lockout

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash        TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failed_login_count   INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_locked
  ON users(locked_until) WHERE locked_until IS NOT NULL;
