-- Sign in with Apple: store the stable Apple subject identifier on the
-- realtor row. Apple's `sub` claim is the durable per-team user id; we
-- match on it for repeat logins. NULL = realtor has never signed in with
-- Apple (still allowed to via email/password/magic-link).

ALTER TABLE realtors
  ADD COLUMN IF NOT EXISTS apple_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS realtors_apple_sub_idx
  ON realtors (apple_sub)
  WHERE apple_sub IS NOT NULL;
