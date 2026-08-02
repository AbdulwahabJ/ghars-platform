-- Seed the six approved WhatsApp templates (Phase 4 spec — exact Arabic copy).
-- Idempotent: only inserts when the table is empty so re-runs never duplicate.
INSERT INTO "whatsapp_templates" ("name", "body", "is_approved", "sort_order")
SELECT * FROM (VALUES
  ('تذكير بالموعد', 'أهلًا {{patientName}}،
نذكركم بموعدكم في مجمع السن الرقمي الطبي يوم {{date}} الساعة {{time}}.
لتأكيد الموعد أو طلب تغييره يرجى الرد على الرسالة.', true, 1),
  ('متابعة زراعة', 'أهلًا {{patientName}}،
حان موعد المتابعة لدى د. همام.
نرجو التواصل معنا لتحديد الموعد المناسب.', true, 2),
  ('استكمال العلاج', 'أهلًا {{patientName}}،
نود إبلاغكم بأن موعد استكمال المرحلة القادمة من العلاج أصبح متاحًا.
نرجو التواصل معنا لتحديد الموعد المناسب.', true, 3),
  ('موعد فائت', 'أهلًا {{patientName}}،
لاحظنا عدم تمكنكم من الحضور إلى موعدكم.
نرجو التواصل معنا لإعادة جدولة الموعد.', true, 4),
  ('متابعة بعد الإجراء', 'أهلًا {{patientName}}،
نطمئن على حالتكم بعد الإجراء.
في حال وجود أي استفسار أو ملاحظة، يرجى التواصل معنا.', true, 5),
  ('تذكير مالي عام', 'أهلًا {{patientName}}،
نود تذكيركم بوجود مبلغ متبقٍ ضمن خطة العلاج.
للمزيد من التفاصيل أو التنسيق يرجى التواصل مع الاستقبال.', true, 6)
) AS seed("name", "body", "is_approved", "sort_order")
WHERE NOT EXISTS (SELECT 1 FROM "whatsapp_templates");
