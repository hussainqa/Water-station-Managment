ALTER TABLE "users" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint

-- Hand-written from here. The auth tables (emails, password hashes, sessions) are
-- reachable only by the dedicated `wtp_auth` role, which the auth layer alone uses
-- (src/lib/auth/db.ts). The app role loses all access to them.
REVOKE ALL ON users, sessions, accounts, verifications FROM wtp_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO wtp_auth;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications TO wtp_auth;
--> statement-breakpoint

-- The app reads the signed-in user's own profile through this view and nothing more.
-- It runs with its owner's rights and filters on the transaction-local app.user_id,
-- so outside withUser() it returns no rows. Profile changes go through Better Auth.
CREATE VIEW my_profile AS
SELECT id, full_name, job_title, email, locale, theme
FROM users
WHERE id = app_user_id();
--> statement-breakpoint
GRANT SELECT ON my_profile TO wtp_app;
