const errors = {
  generic: "Something went wrong. Please try again.",
  INVALID_CREDENTIALS: "The username or password is incorrect.",
  RATE_LIMITED: "Too many attempts. Please try again shortly.",
  EMAIL_NOT_CONFIGURED: "Email service is not configured. Please contact an administrator.",
  RESET_TOKEN_INVALID: "This reset link is invalid or expired.",
  VALIDATION_FAILED: "Please review the information you entered.",
  EMAIL_ALREADY_USED: "This email address is already used by another account.",
  USERNAME_ALREADY_USED: "This username is already in use.",
  UNAUTHORIZED: "Your session has ended. Please sign in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  PATIENT_NOT_FOUND: "The patient file was not found.",
  CASE_NOT_FOUND: "The implant case was not found.",
  FOLLOWUP_NOT_FOUND: "The follow-up was not found.",
  PAYMENT_NOT_FOUND: "The payment was not found.",
  PAYMENT_INVALID: "The payment details are invalid.",
  INTERNAL: "Unable to complete the operation. Please try again.",
} as const;

export default errors;