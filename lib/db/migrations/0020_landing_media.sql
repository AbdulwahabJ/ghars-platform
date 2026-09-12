CREATE TABLE IF NOT EXISTS "landing_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title_ar" text NOT NULL,
  "title_en" text NOT NULL,
  "description_ar" text,
  "description_en" text,
  "media_type" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "source_type" text NOT NULL,
  "file_ref" text NOT NULL,
  "mime_type" text,
  "size_bytes" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "landing_media_type_check" CHECK ("media_type" IN ('HERO', 'GALLERY')),
  CONSTRAINT "landing_media_source_check" CHECK ("source_type" IN ('STATIC', 'OBJECT')),
  CONSTRAINT "landing_media_mime_check" CHECK ("mime_type" IS NULL OR "mime_type" IN ('image/png', 'image/jpeg', 'image/webp')),
  CONSTRAINT "landing_media_size_check" CHECK ("size_bytes" IS NULL OR ("size_bytes" > 0 AND "size_bytes" <= 10485760))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_landing_media_type_active_order"
  ON "landing_media" ("media_type", "is_active", "sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_landing_media_active_hero"
  ON "landing_media" ("media_type")
  WHERE "media_type" = 'HERO' AND "is_active" = true;--> statement-breakpoint
INSERT INTO "landing_media"
  ("id", "title_ar", "title_en", "description_ar", "description_en", "media_type", "sort_order", "is_active", "source_type", "file_ref")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'منصة ذكية لإدارة زراعة الأسنان', 'Smart Platform for Dental Implants',
   'غرس تساعد عيادات زراعة الأسنان على إدارة المرضى، حالات الزرعات، الإجراءات الجراحية مثل ترقيع العظم ورفع الجيب، والمتابعات، والدفعات، والتقارير من نظام واحد متكامل.',
   'Ghars helps dental implant clinics manage patients, implant cases, surgical procedures like bone grafting and sinus lifting, follow-ups, payments, and reports from one integrated system.',
   'HERO', 0, true, 'STATIC', '/assets/dashboard.png'),
  ('00000000-0000-4000-8000-000000000002', 'لوحة التحكم', 'Dashboard', NULL, NULL, 'GALLERY', 0, true, 'STATIC', '/assets/dashboard.png'),
  ('00000000-0000-4000-8000-000000000003', 'تسجيل الدخول', 'Login', NULL, NULL, 'GALLERY', 1, true, 'STATIC', '/assets/login_screen.png'),
  ('00000000-0000-4000-8000-000000000004', 'قائمة الحالات', 'Cases List', NULL, NULL, 'GALLERY', 2, true, 'STATIC', '/assets/cases_list.png'),
  ('00000000-0000-4000-8000-000000000005', 'ملف المريض', 'Patient File', NULL, NULL, 'GALLERY', 3, true, 'STATIC', '/assets/patient_file.png'),
  ('00000000-0000-4000-8000-000000000006', 'المالية والمدفوعات', 'Finances', NULL, NULL, 'GALLERY', 4, true, 'STATIC', '/assets/patient_finance.png'),
  ('00000000-0000-4000-8000-000000000007', 'الرسوم البيانية', 'Charts', NULL, NULL, 'GALLERY', 5, true, 'STATIC', '/assets/statistics_charts.png'),
  ('00000000-0000-4000-8000-000000000008', 'التقارير', 'Reports', NULL, NULL, 'GALLERY', 6, true, 'STATIC', '/assets/statistics_report.png'),
  ('00000000-0000-4000-8000-000000000009', 'إدارة الموظفين', 'Staff Management', NULL, NULL, 'GALLERY', 7, true, 'STATIC', '/assets/settings_staff.png'),
  ('00000000-0000-4000-8000-000000000010', 'إدارة المنصة', 'Platform Management', NULL, NULL, 'GALLERY', 8, true, 'STATIC', '/assets/settings_platform.png')
ON CONFLICT ("id") DO NOTHING;