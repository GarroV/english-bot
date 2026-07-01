-- Fix #4 (login-CSRF, session-fixation direction): bind a login token to the browser that minted it.
-- At mint, /api/auth/telegram/start sets an httpOnly cookie carrying a random nonce and stores its
-- SHA-256 in nonce_hash; /api/auth/telegram/session consumes the token ONLY if the request presents
-- the matching cookie. This stops a token confirmed by one browser/user from being redeemed in a
-- different browser (classic session fixation). The primary account-takeover direction (a victim
-- confirming an attacker-initiated login) is handled bot-side by the explicit confirm step.
-- deny-all RLS unchanged (service-role only).
alter table folio_login_tokens add column nonce_hash text;
