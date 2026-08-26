UPDATE "system_errors"
SET
  "is_resolved" = true,
  "resolved_at" = COALESCE("resolved_at", now()),
  "resolution_note" = CASE
    WHEN "resolution_note" IS NULL OR btrim("resolution_note") = ''
      THEN 'Historical preferences error closed after tenantless preference handling was corrected.'
    ELSE "resolution_note"
  END
WHERE
  "is_resolved" = false
  AND "route" = '/api/preferences'
  AND "method" = 'PATCH'
  AND "error_type" = 'TypeError';