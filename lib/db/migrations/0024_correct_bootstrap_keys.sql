-- 0023 was already applied with the procedure-tag keys 5 and 6.
-- Move those two keys to the stable values used by the bootstrap service.
-- Update the second row first so the tenant-scoped unique index is never
-- temporarily violated.
UPDATE "lookup_options"
SET "bootstrap_key" = 'lookup:procedure-tag:7'
WHERE "category" = 'procedure_tag'
  AND "value" = 'مخصص'
  AND "bootstrap_key" = 'lookup:procedure-tag:6';--> statement-breakpoint
UPDATE "lookup_options"
SET "bootstrap_key" = 'lookup:procedure-tag:6'
WHERE "category" = 'procedure_tag'
  AND "value" = 'مؤقت'
  AND "bootstrap_key" = 'lookup:procedure-tag:5';