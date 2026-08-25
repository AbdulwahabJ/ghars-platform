const admin = {
  settings: { title: "الإعدادات", tabs: { users: "المستخدمون", lookups: "القوائم", audit: "سجل النشاط", export: "تصدير البيانات" } },
  users: {
    title: "إدارة المستخدمين", newUser: "مستخدم جديد", fullName: "الاسم الكامل", username: "اسم المستخدم", email: "البريد الإلكتروني", role: "الدور", status: "الحالة", viewFinancials: "عرض المالية", recordPayments: "تسجيل دفعات", lastLogin: "آخر دخول",
    active: "نشط", suspended: "موقوف", yes: "نعم", no: "لا", edit: "تعديل", deactivate: "إيقاف", activate: "تفعيل", resetPassword: "إعادة تعيين كلمة المرور",
    retentionNotice: "لا يمكن حذف المستخدمين حفاظًا على السجلات التاريخية — يمكن إيقافهم فقط. إيقاف المستخدم يمنع دخوله فورًا مع بقاء جميع سجلاته ظاهرة.",
    operationFailed: "تعذر تنفيذ العملية", unexpectedError: "حدث خطأ غير متوقع.", avatar: "صورة الملف الشخصي", created: "تم إنشاء المستخدم بنجاح.", saved: "تم حفظ التعديلات.", passwordReset: "تمت إعادة تعيين كلمة المرور.", passwordResetDescription: "تم إنهاء جلسات المستخدم الحالية وسيحتاج لتسجيل الدخول من جديد.", deactivated: "تم إيقاف المستخدم وإنهاء جلساته.", activated: "تمت إعادة تفعيل المستخدم.",
    createTitle: "مستخدم جديد", usernameLogin: "اسم المستخدم (للدخول)", recoveryEmail: "البريد الإلكتروني للاستعادة", temporaryPassword: "كلمة المرور المؤقتة", passwordHint: "12 خانة على الأقل وتتضمن حرفًا ورقمًا.", create: "إنشاء المستخدم",
    editTitle: "تعديل المستخدم {{name}}", legacyEmailNotice: "هذا الحساب قديم ولا يملك بريدًا للاستعادة حتى يتم حفظ بريد صالح.", permissionNotice: "تسري تعديلات الصلاحيات فورًا على جلسات المستخدم الحالية.", saveChanges: "حفظ التعديلات",
    resetTitle: "إعادة تعيين كلمة مرور {{name}}", newPassword: "كلمة المرور الجديدة", resetHint: "سيتم إنهاء جلسات المستخدم الحالية بعد إعادة التعيين.", reset: "إعادة التعيين",
    permissionDefault: "حسب الدور (افتراضي)", allowed: "مسموح", denied: "ممنوع",
  },
  lookup: {
    title: "إدارة القوائم المنسدلة", category: "الفئة", newValue: "قيمة جديدة…", add: "إضافة", order: "الترتيب", value: "القيمة", status: "الحالة", actions: "إجراءات", empty: "لا توجد خيارات في هذه الفئة بعد.",
    active: "نشط", suspended: "موقوف", referenced: "مستخدم في سجلات", referencedTitle: "توجد سجلات تاريخية تستخدم هذه القيمة", moveUp: "تحريك لأعلى", moveDown: "تحريك لأسفل", rename: "اضغط لإعادة التسمية", deactivate: "إيقاف", activate: "تفعيل", delete: "حذف",
    operationFailed: "تعذر تنفيذ العملية", unexpectedError: "حدث خطأ غير متوقع.", added: "تمت إضافة الخيار.", renamed: "تمت إعادة التسمية.", renameDescription: "السجلات التاريخية تحتفظ بالقيمة القديمة كما هي.", deleted: "تم حذف الخيار.",
    deleteReferenced: "لا يمكن الحذف لوجود سجلات تستخدم هذه القيمة — يمكن إيقافها بدلًا من ذلك.", retentionNotice: "إيقاف الخيار يخفيه من القوائم الجديدة فقط — السجلات القديمة تبقى كما هي. الحذف متاح فقط للخيارات غير المستخدمة في أي سجل.",
    categories: { implant_system: "أنظمة الزرعات", q_value: "خيارات Q", former_value: "خيارات Former", graft_value: "خيارات Graft", procedure_tag: "وسوم الإجراء", bone_graft_procedure_type: "أنواع إجراءات زراعة العظم", bone_graft_material: "مواد زراعة العظم", bone_graft_membrane: "أغشية زراعة العظم", bone_graft_status: "حالات إجراءات زراعة العظم" },
  },
  audit: {
    recent: "آخر النشاطات", title: "سجل النشاط", exportCsv: "تصدير CSV", from: "من تاريخ", to: "إلى تاريخ", user: "المستخدم", action: "الإجراء", entityType: "نوع السجل", fileNumber: "رقم الملف", all: "الكل", fileNumberPlaceholder: "مثال: 1001",
    time: "الوقت", description: "الوصف", empty: "لا توجد سجلات مطابقة للفلاتر المحددة.", total: "إجمالي السجلات: {{count}}", previous: "السابق", next: "التالي", page: "صفحة {{page}} من {{totalPages}}",
    actions: { patient_create: "إضافة مريض", patient_update: "تعديل بيانات مريض", patient_archive: "أرشفة ملف مريض", patient_restore: "استعادة ملف مريض", implant_case_create: "إضافة حالة زراعة", implant_case_update: "تعديل حالة زراعة", implant_create: "إضافة زرعة", implant_update: "تعديل زرعة", case_base_amount_update: "تحديث مبلغ العلاج", payment_create: "تسجيل دفعة", payment_void: "إلغاء دفعة", followup_created: "إضافة متابعة", followup_updated: "تعديل متابعة", followup_completed: "إتمام متابعة", user_create: "إنشاء مستخدم", login_success: "تسجيل دخول" },
  },
  export: { title: "تصدير كامل البيانات (CSV)", description: "ملفات CSV بترميز UTF-8 تُفتح مباشرة في Excel. التصدير للقراءة فقط ولا يتضمن أي بيانات حسّاسة (لا كلمات مرور ولا حسابات مستخدمين).", entities: { patients: "المرضى", cases: "حالات الزراعة", implants: "الزرعات", payments: "الدفعات", charges: "الرسوم الإضافية", discounts: "الخصومات", followups: "المتابعات", communications: "سجل التواصل" } },
} as const;
export default admin;