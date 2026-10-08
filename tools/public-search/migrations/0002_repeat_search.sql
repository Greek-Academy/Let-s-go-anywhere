-- Preserve the original per-account record, count, and result when lifting the pilot cap.
ALTER TABLE attempts ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attempts ADD COLUMN result_created_at INTEGER;
UPDATE attempts SET result_created_at = created_at WHERE result IS NOT NULL;
