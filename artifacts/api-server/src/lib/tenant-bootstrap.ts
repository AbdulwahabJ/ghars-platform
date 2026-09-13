import {
  db,
  implantSystemOptionsTable,
  lookupOptionsTable,
  whatsappTemplatesTable,
} from "@workspace/db";

type BootstrapTransaction = Pick<typeof db, "insert">;

/**
 * Defaults used by the tenant-facing implant and communications workflows.
 *
 * Keep this list limited to values that are actually consumed by the
 * tenant-scoped options endpoints. Case statuses, implant statuses, and
 * adjunct procedure categories are canonical enums/defaults, not lookup rows.
 */
const DEFAULT_IMPLANT_SYSTEMS = [
  "ROT / Root",
  "Bio",
  "Neodent",
  "Neoss",
  "Ora",
  "KOR",
  "Ritt",
  "MegaGen",
  "Mediden",
  "Other",
] as const;

const defaultKeyPart = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const DEFAULT_LOOKUP_OPTIONS = [
  ...(["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "70", "75", "80"].map(
    (value, sortOrder) => ({
      category: "q_value",
      value,
      sortOrder,
      bootstrapKey: `lookup:q-value:${value}`,
    }),
  )),
  ...(["N", "Y", "M17", "M30", "MST", "ST", "MU15", "MU17", "MU30", "MUST"].map(
    (value, sortOrder) => ({
      category: "former_value",
      value,
      sortOrder,
      bootstrapKey: `lookup:former-value:${value.toLowerCase()}`,
    }),
  )),
  ...(["N", "Y", "ALLO"].map((value, sortOrder) => ({
    category: "graft_value",
    value,
    sortOrder,
    bootstrapKey: `lookup:graft-value:${value.toLowerCase()}`,
  }))),
  ...(["DIRECT", "IMMED", "FLAPLESS", "Sas101", "R.R", "F", "مؤقت", "مخصص"].map(
    (value, sortOrder) => ({
      category: "procedure_tag",
      value,
      sortOrder,
      bootstrapKey: `lookup:procedure-tag:${defaultKeyPart(value) || sortOrder}`,
    }),
  )),
  ...(["ترقيع عظمي", "رفع جيب أنفي", "توسيع العظم"].map((value, sortOrder) => ({
    category: "bone_graft_procedure_type",
    value,
    sortOrder,
    bootstrapKey: `lookup:bone-graft-procedure-type:${sortOrder + 1}`,
  }))),
  ...(["عظم ذاتي", "عظم صناعي", "عظم بشري معالج"].map((value, sortOrder) => ({
    category: "bone_graft_material",
    value,
    sortOrder,
    bootstrapKey: `lookup:bone-graft-material:${sortOrder + 1}`,
  }))),
  ...(["غشاء كولاجين", "غشاء غير ممتص"].map((value, sortOrder) => ({
    category: "bone_graft_membrane",
    value,
    sortOrder,
    bootstrapKey: `lookup:bone-graft-membrane:${sortOrder + 1}`,
  }))),
  ...(["مخطط", "تم", "ملغى"].map((value, sortOrder) => ({
    category: "bone_graft_status",
    value,
    sortOrder,
    bootstrapKey: `lookup:bone-graft-status:${sortOrder + 1}`,
  }))),
] as const;

/**
 * These are intentionally manual-send message templates. They are
 * tenant-neutral, bilingual, and use only placeholders supported by the
 * existing renderer (patientName/date/time).
 */
const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    name: "Appointment Confirmation",
    bootstrapKey: "whatsapp:appointment-confirmation",
    body:
      "مرحبًا {{patientName}}،\nتم تأكيد موعدكم يوم {{date}} الساعة {{time}}.\n\nHello {{patientName}},\nYour appointment is confirmed for {{date}} at {{time}}.",
  },
  {
    name: "Appointment Reminder",
    bootstrapKey: "whatsapp:appointment-reminder",
    body:
      "مرحبًا {{patientName}}،\nنذكركم بموعدكم يوم {{date}} الساعة {{time}}.\n\nHello {{patientName}},\nThis is a reminder for your appointment on {{date}} at {{time}}.",
  },
  {
    name: "Post-Implant Follow-up",
    bootstrapKey: "whatsapp:post-implant-follow-up",
    body:
      "مرحبًا {{patientName}}،\nنرجو التواصل لتنسيق متابعة ما بعد زراعة الأسنان.\n\nHello {{patientName}},\nPlease contact us to arrange your post-implant follow-up.",
  },
  {
    name: "Bone Graft Follow-up",
    bootstrapKey: "whatsapp:bone-graft-follow-up",
    body:
      "مرحبًا {{patientName}}،\nنرجو التواصل لتنسيق متابعة زراعة العظم.\n\nHello {{patientName}},\nPlease contact us to arrange your bone graft follow-up.",
  },
  {
    name: "Sinus Lift Follow-up",
    bootstrapKey: "whatsapp:sinus-lift-follow-up",
    body:
      "مرحبًا {{patientName}}،\nنرجو التواصل لتنسيق متابعة رفع الجيب الفكي.\n\nHello {{patientName}},\nPlease contact us to arrange your sinus lift follow-up.",
  },
  {
    name: "Post-Surgical Follow-up",
    bootstrapKey: "whatsapp:post-surgical-follow-up",
    body:
      "مرحبًا {{patientName}}،\nنرجو التواصل للاطمئنان والمتابعة بعد الإجراء الجراحي.\n\nHello {{patientName}},\nPlease contact us for your post-surgical follow-up.",
  },
  {
    name: "Temporary Prosthetic Appointment",
    bootstrapKey: "whatsapp:temporary-prosthetic-appointment",
    body:
      "مرحبًا {{patientName}}،\nموعدكم لتركيب التعويض المؤقت يوم {{date}} الساعة {{time}}.\n\nHello {{patientName}},\nYour temporary prosthetic appointment is on {{date}} at {{time}}.",
  },
  {
    name: "Final Prosthetic Appointment",
    bootstrapKey: "whatsapp:final-prosthetic-appointment",
    body:
      "مرحبًا {{patientName}}،\nموعدكم لتركيب التعويض النهائي يوم {{date}} الساعة {{time}}.\n\nHello {{patientName}},\nYour final prosthetic appointment is on {{date}} at {{time}}.",
  },
  {
    name: "Prosthetic Follow-up",
    bootstrapKey: "whatsapp:prosthetic-follow-up",
    body:
      "مرحبًا {{patientName}}،\nنرجو التواصل لتنسيق متابعة التعويض.\n\nHello {{patientName}},\nPlease contact us to arrange your prosthetic follow-up.",
  },
  {
    name: "Missed Appointment",
    bootstrapKey: "whatsapp:missed-appointment",
    body:
      "مرحبًا {{patientName}}،\nلاحظنا عدم تمكنكم من الحضور إلى موعدكم. نرجو التواصل لإعادة التنسيق.\n\nHello {{patientName}},\nWe missed you at your appointment. Please contact us to arrange another time.",
  },
  {
    name: "Rescheduling",
    bootstrapKey: "whatsapp:rescheduling",
    body:
      "مرحبًا {{patientName}}،\nيرجى التواصل لتغيير موعدكم وتحديد وقت مناسب.\n\nHello {{patientName}},\nPlease contact us to reschedule your appointment.",
  },
  {
    name: "General Patient Communication",
    bootstrapKey: "whatsapp:general-patient-communication",
    body:
      "مرحبًا {{patientName}}،\nنرجو التواصل معنا بخصوص موعدكم أو استفساركم.\n\nHello {{patientName}},\nPlease contact us regarding your appointment or question.",
  },
] as const;

/**
 * Create the editable defaults for a tenant. Every insert is scoped by the
 * tenant id and protected by its database unique key, so retries and
 * concurrent bootstrap calls cannot duplicate or overwrite admin edits.
 */
export async function bootstrapTenantDefaults(
  tx: BootstrapTransaction,
  tenantId: string,
): Promise<void> {
  await tx
    .insert(implantSystemOptionsTable)
    .values(
      DEFAULT_IMPLANT_SYSTEMS.map((name, sortOrder) => ({
        tenantId,
        name,
        bootstrapKey: `implant-system:${defaultKeyPart(name) || sortOrder}`,
        sortOrder,
      })),
    )
    .onConflictDoNothing({
      target: [
        implantSystemOptionsTable.tenantId,
        implantSystemOptionsTable.bootstrapKey,
      ],
    });

  await tx
    .insert(lookupOptionsTable)
    .values(
      DEFAULT_LOOKUP_OPTIONS.map(({ category, value, sortOrder, bootstrapKey }) => ({
        tenantId,
        category,
        value,
        bootstrapKey,
        sortOrder,
      })),
    )
    .onConflictDoNothing({
      target: [
        lookupOptionsTable.tenantId,
        lookupOptionsTable.bootstrapKey,
      ],
    });

  await tx
    .insert(whatsappTemplatesTable)
    .values(
      DEFAULT_WHATSAPP_TEMPLATES.map(({ name, body, bootstrapKey }, sortOrder) => ({
        tenantId,
        name,
        body,
        bootstrapKey,
        sortOrder: sortOrder + 1,
        isApproved: true,
      })),
    )
    .onConflictDoNothing({
      target: [
        whatsappTemplatesTable.tenantId,
        whatsappTemplatesTable.bootstrapKey,
      ],
    });
}

export {
  DEFAULT_IMPLANT_SYSTEMS,
  DEFAULT_LOOKUP_OPTIONS,
  DEFAULT_WHATSAPP_TEMPLATES,
};