import i18n, { getLocale } from "@/i18n";

const legacyValidationMessages: Record<string, string> = {
  "يرجى إدخال اسم المستخدم.": "validation.usernameRequired",
  "يرجى إدخال كلمة المرور.": "validation.passwordRequired",
  "البريد الإلكتروني مطلوب.": "validation.emailRequired",
  "مفتاح الإعداد مطلوب.": "validation.setupKeyRequired",
  "الاسم الكامل مطلوب.": "validation.fullNameRequired",
  "يرجى إدخال اسم المستخدم أو البريد الإلكتروني.":
    "validation.identifierRequired",
  "رابط الاستعادة غير صالح.": "validation.resetTokenInvalid",
  "كلمة المرور يجب أن تتكون من 10 أحرف على الأقل.": "validation.passwordMin",
  "كلمة المرور طويلة جدًا.": "validation.passwordTooLong",
  "كلمة المرور يجب أن تحتوي على حروف.": "validation.passwordLetters",
  "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.":
    "validation.passwordDigit",
  "اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل.": "validation.usernameMin",
  "اسم المستخدم طويل جدًا.": "validation.usernameMax",
  "اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام فقط.":
    "validation.englishUsername",
  "كلمتا المرور غير متطابقتين.": "validation.passwordsMismatch",
  "يرجى إدخال رقم الجوال.": "validation.phoneRequired",
  "رقم الجوال غير صحيح. يرجى التحقق من الرقم المدخل.":
    "validation.invalidPhone",
  "للأرقام غير السعودية، يرجى إدخال الرقم كاملًا مع رمز الدولة (يبدأ بـ + أو 00). الأرقام السعودية يجب أن تبدأ بـ 05.":
    "validation.phoneCountryCode",
  "اسم المنشأة يجب أن يتكون من حرفين على الأقل.":
    "validation.organizationNameMin",
  "اسم المنشأة طويل جدًا.": "validation.organizationNameMax",
  "الاسم القانوني طويل جدًا.": "validation.organizationNameMax",
  "اسم المالك يجب أن يتكون من حرفين على الأقل.":
    "validation.ownerNameMin",
  "اسم المالك طويل جدًا.": "validation.ownerNameMax",
  "اسم المدينة طويل جدًا.": "validation.cityMax",
  "البريد الإلكتروني طويل جدًا.": "validation.emailTooLong",
  "صيغة البريد الإلكتروني غير صحيحة.": "validation.invalidEmail",
  "صيغة التاريخ غير صحيحة.": "validation.invalidDate",
  "المبلغ يجب أن يكون رقمًا.": "validation.invalidNumber",
  "رقم الملف مطلوب.": "validation.fileNumberRequired",
  "اسم المريض مطلوب.": "validation.patientNameRequired",
};

const localizedMessageKeys: Record<string, string> = {
  ...legacyValidationMessages,
  "Enter your username.": "validation.usernameRequired",
  "Enter your password.": "validation.passwordRequired",
  "Enter your email address.": "validation.emailRequired",
  "Enter the setup key.": "validation.setupKeyRequired",
  "Enter the full name.": "validation.fullNameRequired",
  "Enter your username or email address.": "validation.identifierRequired",
  "The reset link is invalid.": "validation.resetTokenInvalid",
  "This field is required.": "validation.required",
  "Please review this field and try again.": "validation.generic",
  "Something went wrong. Please try again.": "errors.generic",
  "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.": "errors.generic",
};

function translate(key: string): string {
  const [namespace, ...segments] = key.split(".");
  return segments.length > 0
    ? i18n.t(`${namespace}:${segments.join(".")}`)
    : i18n.t(key);
}

/**
 * Converts messages emitted by the legacy Arabic shared Zod schemas at the
 * presentation boundary. English intentionally never renders an unmapped
 * Arabic message; the original issue remains available on the error object.
 */
export function localizeValidationMessage(message: unknown): string {
  const value = typeof message === "string" ? message.trim() : "";
  if (/^errors\.[A-Z0-9_]+$/.test(value)) {
    const key = `errors:${value.slice("errors.".length)}`;
    return i18n.exists(key) ? i18n.t(key) : translate("validation.generic");
  }

  if (getLocale() === "ar") {
    return value || translate("validation.generic");
  }

  const key = localizedMessageKeys[value];
  return key ? translate(key) : translate("validation.generic");
}

/**
 * Localizes an API error without exposing an arbitrary server error payload.
 * `rawMessage` is deliberately not interpolated or translated: it can include
 * user-entered data and is retained only in ApiError.data for diagnostics.
 */
export function localizeApiErrorMessage(
  code?: string,
  rawMessage?: unknown,
): string {
  if (code && i18n.exists(`errors:${code}`)) {
    return translate(`errors.${code}`);
  }

  if (getLocale() === "ar" && typeof rawMessage === "string" && rawMessage) {
    return rawMessage;
  }

  return translate("errors.generic");
}

/**
 * Use when an arbitrary Error is about to be rendered. ApiError-like values
 * are recognized structurally to avoid a dependency cycle with api.ts.
 */
export function localizeErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error
  ) {
    const apiError = error as { code?: unknown; message?: unknown };
    return localizeApiErrorMessage(
      typeof apiError.code === "string" ? apiError.code : undefined,
      apiError.message,
    );
  }

  if (error instanceof Error && getLocale() === "ar" && error.message) {
    return error.message;
  }

  return translate("errors.generic");
}