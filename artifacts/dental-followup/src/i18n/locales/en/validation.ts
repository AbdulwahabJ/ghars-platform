const validation = {
  required: "This field is required.",
  invalidEmail: "Enter a valid email address.",
  emailTooLong: "The email address is too long.",
  invalidDate: "The date is invalid.",
  invalidNumber: "Enter a valid number.",
  passwordMin: "Password must be at least 10 characters.",
  passwordLetters: "Password must contain letters.",
  passwordDigit: "Password must contain at least one number.",
  passwordTooLong: "The password is too long.",
  passwordsMismatch: "Passwords do not match.",
  usernameMin: "Username must be at least 3 characters.",
  usernameMax: "Username is too long.",
  englishUsername: "Username may contain English letters and numbers only.",
} as const;

export default validation;