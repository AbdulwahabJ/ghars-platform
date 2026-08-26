ALTER TABLE "tenant_memberships"
  ADD COLUMN "is_active" boolean DEFAULT true NOT NULL,
  ADD COLUMN "can_view_financials" boolean,
  ADD COLUMN "can_record_payments" boolean;--> statement-breakpoint
UPDATE "tenant_memberships" membership
SET
  "is_active" = users."is_active",
  "can_view_financials" = users."can_view_financials",
  "can_record_payments" = users."can_record_payments"
FROM "users" users
WHERE users."id" = membership."user_id";