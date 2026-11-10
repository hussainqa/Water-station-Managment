-- Assessment rules enforced by the database. Hand-written.
--
-- 1. No two assessments of the SAME length for the same plant may cover overlapping
--    months (drafts included). Different lengths may overlap (a quarterly and a
--    monthly view are both valid). The existing unique (plant, start, months)
--    constraint is the special case of an exact duplicate.
-- 2. An approved assessment is final for the application: it cannot be updated or
--    deleted, and its readings cannot be added, removed or changed, except for the
--    per-indicator note. Owner-role scripts (seed, reset, test cleanup) are exempt.
--
-- Violations raise SQLSTATE 23P01 (exclusion) and WA001 / WA002 (final).

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

ALTER TABLE assessments
  ADD CONSTRAINT assessments_same_length_no_overlap
  EXCLUDE USING gist (
    plant_id WITH =,
    months WITH =,
    daterange(period_start, (period_start + make_interval(months => months))::date) WITH &&
  );
--> statement-breakpoint

CREATE FUNCTION guard_approved_assessment() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'wtp_app' AND OLD.status = 'approved' THEN
    RAISE EXCEPTION 'approved assessments are final' USING ERRCODE = 'WA001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER assessments_final
  BEFORE UPDATE OR DELETE ON assessments
  FOR EACH ROW EXECUTE FUNCTION guard_approved_assessment();
--> statement-breakpoint

CREATE FUNCTION guard_approved_reading() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status assessment_status;
BEGIN
  IF current_user <> 'wtp_app' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT status INTO parent_status
  FROM assessments
  WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.assessment_id ELSE OLD.assessment_id END;

  -- parent_status is NULL while a draft and its readings are being deleted together.
  IF parent_status = 'approved' THEN
    IF TG_OP <> 'UPDATE'
       OR (to_jsonb(NEW) - 'note') IS DISTINCT FROM (to_jsonb(OLD) - 'note') THEN
      RAISE EXCEPTION 'readings of an approved assessment are final (only the note may change)'
        USING ERRCODE = 'WA002';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

CREATE TRIGGER assessment_readings_final
  BEFORE INSERT OR UPDATE OR DELETE ON assessment_readings
  FOR EACH ROW EXECUTE FUNCTION guard_approved_reading();
