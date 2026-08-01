-- Documented reimplantation rule, enforced at the database level:
-- inside one case, a site may have only ONE active implant. An implant
-- whose status is فاشلة or تحتاج إعادة (or that is archived) no longer
-- blocks the site, allowing the documented reimplantation workflow.
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_implants_active_site"
  ON "implants" ("implant_case_id", "site")
  WHERE "archived_at" IS NULL
    AND "implant_status" NOT IN ('فاشلة', 'تحتاج إعادة');
