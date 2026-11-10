-- Security model. Hand-written; drizzle-kit does not manage anything in this file.
--
--   wtp_owner  runs migrations and seed scripts, owns every table.
--   wtp_app    the application role (created in docker/initdb/01-roles.sh):
--              no superuser, no BYPASSRLS, owns nothing. Everything it may do is granted here.
--
-- When a later migration adds a user-owned table it MUST repeat the three steps of
-- section 3 for that table. tests/db/rls-coverage.test.ts fails otherwise.

GRANT USAGE ON SCHEMA public TO wtp_app;
--> statement-breakpoint

-- 1. Auth tables (Better Auth). No RLS: the auth layer reads them before a user is known.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications TO wtp_app;
--> statement-breakpoint

-- 2. Reference data: read-only for the app, and the research figures stay hidden.
GRANT SELECT ON indicator_groups, indicators, indicator_default_limits,
  obstacle_axes, action_axes, obstacles TO wtp_app;
--> statement-breakpoint
-- No grant on corrective_actions.rii
GRANT SELECT (code, axis_idx, seq_in_axis, source_row, text_ar, text_en)
  ON corrective_actions TO wtp_app;
--> statement-breakpoint
-- No grant on obstacle_action_links.correlation_r / priority_pct
GRANT SELECT (obstacle_code, action_code, rank) ON obstacle_action_links TO wtp_app;
--> statement-breakpoint

-- "Show all actions" ordering: a position only, never the RII value.
-- The view runs with its owner's rights (wtp_owner), which is what lets it read rii.
CREATE VIEW corrective_actions_ranked AS
SELECT
  code,
  axis_idx,
  seq_in_axis,
  text_ar,
  text_en,
  (row_number() OVER (ORDER BY rii DESC, code))::integer AS sort_position
FROM corrective_actions;
--> statement-breakpoint
GRANT SELECT ON corrective_actions_ranked TO wtp_app;
--> statement-breakpoint

-- 3. User-owned tables: row-level security keyed on the transaction-local setting
--    app.user_id, which src/db/with-user.ts sets from the verified session.
--    If the setting is missing the function returns NULL and no row matches.
CREATE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_indicator_groups',
    'user_indicators',
    'plants',
    'plant_indicators',
    'indicator_limits',
    'assessments',
    'assessment_readings',
    'problems',
    'custom_obstacles',
    'problem_obstacles',
    'problem_actions',
    'custom_actions',
    'audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY owner_only ON %I FOR ALL TO wtp_app
         USING (owner_id = app_user_id())
         WITH CHECK (owner_id = app_user_id())', t);
    IF t = 'audit_events' THEN
      -- The audit trail is append-only for the app.
      EXECUTE format('GRANT SELECT, INSERT ON %I TO wtp_app', t);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO wtp_app', t);
    END IF;
  END LOOP;
END
$$;
