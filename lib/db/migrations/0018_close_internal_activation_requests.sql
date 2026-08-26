UPDATE "tenant_activation_requests" AS "request"
SET
  "status" = 'REJECTED',
  "workflow_status" = 'CLOSED',
  "note" = CASE
    WHEN "request"."note" IS NULL OR btrim("request"."note") = ''
      THEN 'Automatically closed: internal tenants are outside commercial workflows.'
    ELSE "request"."note"
  END,
  "resolved_at" = COALESCE("request"."resolved_at", now()),
  "updated_at" = now()
FROM "tenants" AS "tenant"
WHERE "tenant"."id" = "request"."tenant_id"
  AND "tenant"."is_internal" = true
  AND (
    "request"."status" <> 'REJECTED'
    OR "request"."workflow_status" <> 'CLOSED'
    OR "request"."resolved_at" IS NULL
  );