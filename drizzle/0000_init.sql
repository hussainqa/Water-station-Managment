CREATE TYPE "public"."assessment_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."better_direction" AS ENUM('higher', 'lower');--> statement-breakpoint
CREATE TYPE "public"."indicator_method" AS ENUM('direct', 'direct_percent', 'duration', 'ratio', 'average');--> statement-breakpoint
CREATE TYPE "public"."limit_kind" AS ENUM('higher', 'lower', 'range');--> statement-breakpoint
CREATE TYPE "public"."obstacle_classification" AS ENUM('confirmed', 'possible');--> statement-breakpoint
CREATE TYPE "public"."problem_origin" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."reading_status" AS ENUM('ok', 'warning', 'critical', 'insufficient_data', 'no_limits');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"job_title" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT 'ar' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_axes" (
	"idx" integer PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrective_actions" (
	"code" text PRIMARY KEY NOT NULL,
	"axis_idx" integer NOT NULL,
	"seq_in_axis" integer NOT NULL,
	"source_row" integer NOT NULL,
	"text_ar" text NOT NULL,
	"text_en" text NOT NULL,
	"rii" double precision NOT NULL,
	CONSTRAINT "corrective_actions_axis_seq_uq" UNIQUE("axis_idx","seq_in_axis")
);
--> statement-breakpoint
CREATE TABLE "indicator_default_limits" (
	"indicator_code" text PRIMARY KEY NOT NULL,
	"kind" "limit_kind" NOT NULL,
	"target" double precision,
	"warning" double precision,
	"critical" double precision,
	"min_ok" double precision,
	"max_ok" double precision,
	"crit_min" double precision,
	"crit_max" double precision
);
--> statement-breakpoint
CREATE TABLE "indicator_groups" (
	"code" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indicators" (
	"code" text PRIMARY KEY NOT NULL,
	"group_code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"method" "indicator_method" NOT NULL,
	"unit" text NOT NULL,
	"better" "better_direction" NOT NULL,
	"input_labels" jsonb NOT NULL,
	"sort" integer NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obstacle_action_links" (
	"obstacle_code" text NOT NULL,
	"action_code" text NOT NULL,
	"rank" integer NOT NULL,
	"correlation_r" double precision NOT NULL,
	"priority_pct" double precision NOT NULL,
	CONSTRAINT "obstacle_action_links_obstacle_code_action_code_pk" PRIMARY KEY("obstacle_code","action_code"),
	CONSTRAINT "obstacle_action_links_rank_uq" UNIQUE("obstacle_code","rank")
);
--> statement-breakpoint
CREATE TABLE "obstacle_axes" (
	"idx" integer PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obstacles" (
	"code" text PRIMARY KEY NOT NULL,
	"axis_idx" integer NOT NULL,
	"seq_in_axis" integer NOT NULL,
	"source_row" integer NOT NULL,
	"text_ar" text NOT NULL,
	"text_en" text NOT NULL,
	"importance_order" integer,
	CONSTRAINT "obstacles_axis_seq_uq" UNIQUE("axis_idx","seq_in_axis")
);
--> statement-breakpoint
CREATE TABLE "assessment_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"indicator_code" text,
	"user_indicator_id" uuid,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"value" double precision,
	"status" "reading_status",
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "assessment_readings_indicator_ref_ck" CHECK (num_nonnulls(indicator_code, user_indicator_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"months" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"entered_by" text DEFAULT '' NOT NULL,
	"status" "assessment_status" DEFAULT 'draft' NOT NULL,
	"limits_snapshot" jsonb,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "assessments_plant_period_uq" UNIQUE("plant_id","period_start","months"),
	CONSTRAINT "assessments_months_ck" CHECK ("assessments"."months" in (1, 3, 6, 9, 12)),
	CONSTRAINT "assessments_period_start_ck" CHECK (extract(day from "assessments"."period_start") = 1),
	CONSTRAINT "assessments_dates_ck" CHECK ("assessments"."end_date" >= "assessments"."start_date"),
	CONSTRAINT "assessments_approved_ck" CHECK ("assessments"."status" = 'draft' or ("assessments"."approved_at" is not null and "assessments"."limits_snapshot" is not null))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"linked_obstacle_code" text,
	"linked_custom_obstacle_id" uuid,
	"chosen" boolean DEFAULT false NOT NULL,
	"needs_study" boolean DEFAULT false NOT NULL,
	"implemented_on" date,
	CONSTRAINT "custom_actions_linked_obstacle_ck" CHECK (num_nonnulls(linked_obstacle_code, linked_custom_obstacle_id) <= 1)
);
--> statement-breakpoint
CREATE TABLE "custom_obstacles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	CONSTRAINT "custom_obstacles_id_owner_uq" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "indicator_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"indicator_code" text,
	"user_indicator_id" uuid,
	"kind" "limit_kind" NOT NULL,
	"target" double precision,
	"warning" double precision,
	"critical" double precision,
	"min_ok" double precision,
	"max_ok" double precision,
	"crit_min" double precision,
	"crit_max" double precision,
	"none" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_limits_indicator_ref_ck" CHECK (num_nonnulls(indicator_code, user_indicator_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "plant_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"indicator_code" text,
	"user_indicator_id" uuid,
	"adopted" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plant_indicators_indicator_ref_ck" CHECK (num_nonnulls(indicator_code, user_indicator_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"governorate" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"water_source" text NOT NULL,
	"design_capacity" double precision NOT NULL,
	"actual_capacity" double precision,
	"engineer" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plants_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "plants_design_capacity_ck" CHECK ("plants"."design_capacity" > 0),
	CONSTRAINT "plants_actual_capacity_ck" CHECK ("plants"."actual_capacity" is null or "plants"."actual_capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "problem_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"action_code" text NOT NULL,
	"chosen" boolean DEFAULT false NOT NULL,
	"needs_study" boolean DEFAULT false NOT NULL,
	"implemented_on" date,
	"linked_obstacle_code" text,
	"linked_custom_obstacle_id" uuid,
	CONSTRAINT "problem_actions_problem_action_uq" UNIQUE("problem_id","action_code"),
	CONSTRAINT "problem_actions_linked_obstacle_ck" CHECK (num_nonnulls(linked_obstacle_code, linked_custom_obstacle_id) <= 1)
);
--> statement-breakpoint
CREATE TABLE "problem_obstacles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"obstacle_code" text,
	"custom_obstacle_id" uuid,
	"classification" "obstacle_classification" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "problem_obstacles_obstacle_ref_ck" CHECK (num_nonnulls(obstacle_code, custom_obstacle_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"indicator_code" text,
	"user_indicator_id" uuid,
	"detected_on" date NOT NULL,
	"value" double precision,
	"origin" "problem_origin" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"obstacle_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problems_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "problems_indicator_ref_ck" CHECK (num_nonnulls(indicator_code, user_indicator_id) = 1)
);
--> statement-breakpoint
CREATE TABLE "user_indicator_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_indicator_groups_id_owner_uq" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "user_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"group_code" text,
	"user_group_id" uuid,
	"name_ar" text NOT NULL,
	"name_en" text,
	"description" text,
	"method" "indicator_method" NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"better" "better_direction" NOT NULL,
	"input_labels" jsonb NOT NULL,
	"adopt_all_plants" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_indicators_id_owner_uq" UNIQUE("id","owner_id"),
	CONSTRAINT "user_indicators_group_ref_ck" CHECK (num_nonnulls(group_code, user_group_id) = 1)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_axis_idx_action_axes_idx_fk" FOREIGN KEY ("axis_idx") REFERENCES "public"."action_axes"("idx") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_default_limits" ADD CONSTRAINT "indicator_default_limits_indicator_code_indicators_code_fk" FOREIGN KEY ("indicator_code") REFERENCES "public"."indicators"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicators" ADD CONSTRAINT "indicators_group_code_indicator_groups_code_fk" FOREIGN KEY ("group_code") REFERENCES "public"."indicator_groups"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obstacle_action_links" ADD CONSTRAINT "obstacle_action_links_obstacle_code_obstacles_code_fk" FOREIGN KEY ("obstacle_code") REFERENCES "public"."obstacles"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obstacle_action_links" ADD CONSTRAINT "obstacle_action_links_action_code_corrective_actions_code_fk" FOREIGN KEY ("action_code") REFERENCES "public"."corrective_actions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obstacles" ADD CONSTRAINT "obstacles_axis_idx_obstacle_axes_idx_fk" FOREIGN KEY ("axis_idx") REFERENCES "public"."obstacle_axes"("idx") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_readings" ADD CONSTRAINT "assessment_readings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_readings" ADD CONSTRAINT "assessment_readings_indicator_code_indicators_code_fk" FOREIGN KEY ("indicator_code") REFERENCES "public"."indicators"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_readings" ADD CONSTRAINT "assessment_readings_assessment_fk" FOREIGN KEY ("assessment_id","owner_id") REFERENCES "public"."assessments"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_readings" ADD CONSTRAINT "assessment_readings_user_indicator_fk" FOREIGN KEY ("user_indicator_id","owner_id") REFERENCES "public"."user_indicators"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_plant_fk" FOREIGN KEY ("plant_id","owner_id") REFERENCES "public"."plants"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_actions" ADD CONSTRAINT "custom_actions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_actions" ADD CONSTRAINT "custom_actions_linked_obstacle_code_obstacles_code_fk" FOREIGN KEY ("linked_obstacle_code") REFERENCES "public"."obstacles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_actions" ADD CONSTRAINT "custom_actions_problem_fk" FOREIGN KEY ("problem_id","owner_id") REFERENCES "public"."problems"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_actions" ADD CONSTRAINT "custom_actions_custom_obstacle_fk" FOREIGN KEY ("linked_custom_obstacle_id","owner_id") REFERENCES "public"."custom_obstacles"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_obstacles" ADD CONSTRAINT "custom_obstacles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_obstacles" ADD CONSTRAINT "custom_obstacles_problem_fk" FOREIGN KEY ("problem_id","owner_id") REFERENCES "public"."problems"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_limits" ADD CONSTRAINT "indicator_limits_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_limits" ADD CONSTRAINT "indicator_limits_indicator_code_indicators_code_fk" FOREIGN KEY ("indicator_code") REFERENCES "public"."indicators"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_limits" ADD CONSTRAINT "indicator_limits_user_indicator_fk" FOREIGN KEY ("user_indicator_id","owner_id") REFERENCES "public"."user_indicators"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_indicators" ADD CONSTRAINT "plant_indicators_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_indicators" ADD CONSTRAINT "plant_indicators_indicator_code_indicators_code_fk" FOREIGN KEY ("indicator_code") REFERENCES "public"."indicators"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_indicators" ADD CONSTRAINT "plant_indicators_plant_fk" FOREIGN KEY ("plant_id","owner_id") REFERENCES "public"."plants"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_indicators" ADD CONSTRAINT "plant_indicators_user_indicator_fk" FOREIGN KEY ("user_indicator_id","owner_id") REFERENCES "public"."user_indicators"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plants" ADD CONSTRAINT "plants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_actions" ADD CONSTRAINT "problem_actions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_actions" ADD CONSTRAINT "problem_actions_action_code_corrective_actions_code_fk" FOREIGN KEY ("action_code") REFERENCES "public"."corrective_actions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_actions" ADD CONSTRAINT "problem_actions_linked_obstacle_code_obstacles_code_fk" FOREIGN KEY ("linked_obstacle_code") REFERENCES "public"."obstacles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_actions" ADD CONSTRAINT "problem_actions_problem_fk" FOREIGN KEY ("problem_id","owner_id") REFERENCES "public"."problems"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_actions" ADD CONSTRAINT "problem_actions_custom_obstacle_fk" FOREIGN KEY ("linked_custom_obstacle_id","owner_id") REFERENCES "public"."custom_obstacles"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_obstacles" ADD CONSTRAINT "problem_obstacles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_obstacles" ADD CONSTRAINT "problem_obstacles_obstacle_code_obstacles_code_fk" FOREIGN KEY ("obstacle_code") REFERENCES "public"."obstacles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_obstacles" ADD CONSTRAINT "problem_obstacles_problem_fk" FOREIGN KEY ("problem_id","owner_id") REFERENCES "public"."problems"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_obstacles" ADD CONSTRAINT "problem_obstacles_custom_obstacle_fk" FOREIGN KEY ("custom_obstacle_id","owner_id") REFERENCES "public"."custom_obstacles"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_indicator_code_indicators_code_fk" FOREIGN KEY ("indicator_code") REFERENCES "public"."indicators"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_assessment_fk" FOREIGN KEY ("assessment_id","owner_id") REFERENCES "public"."assessments"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_user_indicator_fk" FOREIGN KEY ("user_indicator_id","owner_id") REFERENCES "public"."user_indicators"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_indicator_groups" ADD CONSTRAINT "user_indicator_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_indicators" ADD CONSTRAINT "user_indicators_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_indicators" ADD CONSTRAINT "user_indicators_group_code_indicator_groups_code_fk" FOREIGN KEY ("group_code") REFERENCES "public"."indicator_groups"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_indicators" ADD CONSTRAINT "user_indicators_user_group_fk" FOREIGN KEY ("user_group_id","owner_id") REFERENCES "public"."user_indicator_groups"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "indicators_group_idx" ON "indicators" USING btree ("group_code");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_readings_system_uq" ON "assessment_readings" USING btree ("assessment_id","indicator_code") WHERE "assessment_readings"."indicator_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_readings_user_uq" ON "assessment_readings" USING btree ("assessment_id","user_indicator_id") WHERE "assessment_readings"."user_indicator_id" is not null;--> statement-breakpoint
CREATE INDEX "assessments_owner_idx" ON "assessments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("owner_id","entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "indicator_limits_system_uq" ON "indicator_limits" USING btree ("owner_id","indicator_code") WHERE "indicator_limits"."indicator_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "indicator_limits_user_uq" ON "indicator_limits" USING btree ("owner_id","user_indicator_id") WHERE "indicator_limits"."user_indicator_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "plant_indicators_system_uq" ON "plant_indicators" USING btree ("plant_id","indicator_code") WHERE "plant_indicators"."indicator_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "plant_indicators_user_uq" ON "plant_indicators" USING btree ("plant_id","user_indicator_id") WHERE "plant_indicators"."user_indicator_id" is not null;--> statement-breakpoint
CREATE INDEX "plants_owner_idx" ON "plants" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_obstacles_system_uq" ON "problem_obstacles" USING btree ("problem_id","obstacle_code") WHERE "problem_obstacles"."obstacle_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "problem_obstacles_custom_uq" ON "problem_obstacles" USING btree ("problem_id","custom_obstacle_id") WHERE "problem_obstacles"."custom_obstacle_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "problems_system_uq" ON "problems" USING btree ("assessment_id","indicator_code") WHERE "problems"."indicator_code" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "problems_user_uq" ON "problems" USING btree ("assessment_id","user_indicator_id") WHERE "problems"."user_indicator_id" is not null;--> statement-breakpoint
CREATE INDEX "problems_owner_idx" ON "problems" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "user_indicators_owner_idx" ON "user_indicators" USING btree ("owner_id");