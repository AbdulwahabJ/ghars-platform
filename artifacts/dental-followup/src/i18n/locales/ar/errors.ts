const errors = {
  generic: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
  INVALID_CREDENTIALS: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  RATE_LIMITED: "عدد المحاولات كبير. يرجى المحاولة بعد قليل.",
  EMAIL_NOT_CONFIGURED: "خدمة البريد الإلكتروني غير مهيأة حاليًا. يرجى التواصل مع مدير النظام.",
  RESET_TOKEN_INVALID: "رابط إعادة التعيين غير صالح أو منتهي الصلاحية.",
  VALIDATION_FAILED: "يرجى مراجعة البيانات المدخلة.",
  VALIDATION_ERROR: "يرجى مراجعة البيانات المدخلة.",
  EMAIL_ALREADY_USED: "البريد الإلكتروني مستخدم لحساب آخر.",
  USERNAME_ALREADY_USED: "اسم المستخدم مستخدم بالفعل.",
  UNAUTHORIZED: "انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.",
  FORBIDDEN: "لا تملك صلاحية لتنفيذ هذا الإجراء.",
  PATIENT_NOT_FOUND: "ملف المريض غير موجود.",
  CASE_NOT_FOUND: "حالة الزراعة غير موجودة.",
  FOLLOWUP_NOT_FOUND: "المتابعة غير موجودة.",
  PAYMENT_NOT_FOUND: "الدفعة غير موجودة.",
  PAYMENT_INVALID: "بيانات الدفعة غير صحيحة.",
  INTERNAL: "تعذر تنفيذ العملية. يرجى المحاولة مرة أخرى.",
} as const;

export default errors;