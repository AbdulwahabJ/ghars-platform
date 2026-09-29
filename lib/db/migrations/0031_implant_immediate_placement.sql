ALTER TABLE "implants"
  ADD COLUMN IF NOT EXISTS "immediate_placement" text NOT NULL DEFAULT 'UNSPECIFIED';

ALTER TABLE "implants"
  ADD CONSTRAINT "implants_immediate_placement_check"
  CHECK ("immediate_placement" IN ('YES', 'NO', 'UNSPECIFIED'));