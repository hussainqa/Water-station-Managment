ALTER TABLE "obstacle_action_links" ALTER COLUMN "correlation_r" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "obstacle_action_links" ALTER COLUMN "priority_pct" DROP NOT NULL;--> statement-breakpoint
-- An average is now entered directly as one value. User-defined average indicators get a
-- `value` input label; their old total/count labels are dropped. Stored readings keep their
-- inputs: the app derives value = total / count from them (upgradeLegacyInputs).
UPDATE "user_indicators"
SET "input_labels" = jsonb_build_object('value', jsonb_build_object('ar', 'المتوسط', 'en', 'Average'))
WHERE "method" = 'average' AND NOT ("input_labels" ? 'value');
