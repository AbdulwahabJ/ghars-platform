ALTER TABLE "tenants" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "city_name_normalized" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "city_display_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "phone_country_code" text;--> statement-breakpoint
CREATE INDEX "IDX_tenants_country_code" ON "tenants" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "IDX_tenants_country_city" ON "tenants" USING btree ("country_code","city_name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_tenants_phone_e164" ON "tenants" USING btree ("phone_e164") WHERE "tenants"."phone_e164" IS NOT NULL;--> statement-breakpoint
-- Preserve every legacy city verbatim while making deterministic values queryable.
UPDATE "tenants"
SET "city_display_name" = "city"
WHERE "city" IS NOT NULL;--> statement-breakpoint
UPDATE "tenants"
SET "country_code" = 'SA', "city_name_normalized" = 'makkah'
WHERE lower(trim("city")) IN ('مكة', 'مكة المكرمة', 'makkah', 'mecca');--> statement-breakpoint
UPDATE "tenants"
SET "country_code" = 'SA', "city_name_normalized" = 'jeddah'
WHERE lower(trim("city")) IN ('جدة', 'jeddah');--> statement-breakpoint
UPDATE "tenants"
SET "country_code" = 'SA', "city_name_normalized" = 'riyadh'
WHERE lower(trim("city")) IN ('الرياض', 'riyadh');--> statement-breakpoint
UPDATE "tenants"
SET "country_code" = 'SA', "city_name_normalized" = 'medina'
WHERE lower(trim("city")) IN ('المدينة', 'المدينة المنورة', 'medina', 'medinah');--> statement-breakpoint
UPDATE "tenants"
SET "country_code" = 'AE', "city_name_normalized" = 'dubai'
WHERE lower(trim("city")) IN ('دبي', 'dubai');--> statement-breakpoint
UPDATE "tenants"
SET "country_code" = 'JO', "city_name_normalized" = 'amman'
WHERE lower(trim("city")) IN ('amman', 'عمّان');--> statement-breakpoint
UPDATE "tenants"
SET "country_code" = 'EG', "city_name_normalized" = 'cairo'
WHERE lower(trim("city")) IN ('القاهرة', 'cairo');--> statement-breakpoint
-- Backfill only unambiguous existing Saudi mobile digit strings.
UPDATE "tenants"
SET "phone_e164" = '+966' || substring("contact_phone" from 2),
    "phone_country_code" = 'SA'
WHERE "contact_phone" ~ '^05[0-9]{8}$';--> statement-breakpoint
UPDATE "tenants"
SET "phone_e164" = '+' || "contact_phone",
    "phone_country_code" = 'SA'
WHERE "contact_phone" ~ '^9665[0-9]{8}$';