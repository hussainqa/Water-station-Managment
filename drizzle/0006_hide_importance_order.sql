-- The research importance order of obstacles must never be displayed (client note 12).
-- Like rii, it is now unreadable by the app role: obstacles are read by explicit columns.
REVOKE SELECT ON obstacles FROM wtp_app;
--> statement-breakpoint
GRANT SELECT (code, axis_idx, seq_in_axis, source_row, text_ar, text_en) ON obstacles TO wtp_app;
