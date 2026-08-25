const validation = {
  required: "هذا الحقل مطلوب.",
  invalidEmail: "صيغة البريد الإلكتروني غير صحيحة.",
  emailTooLong: "البريد الإلكتروني طويل جدًا.",
  invalidDate: "التاريخ غير صحيح.",
  invalidNumber: "يرجى إدخال رقم صحيح.",
  passwordMin: "كلمة المرور يجب أن تتكون من 10 أحرف على الأقل.",
  passwordLetters: "كلمة المرور يجب أن تحتوي على حروف.",
  passwordDigit: "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.",
  passwordTooLong: "كلمة المرور طويلة جدًا.",
  passwordsMismatch: "كلمتا المرور غير متطابقتين.",
  usernameMin: "اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل.",
  usernameMax: "اسم المستخدم طويل جدًا.",
  englishUsername: "اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام فقط.",
} as const;

export default validation;