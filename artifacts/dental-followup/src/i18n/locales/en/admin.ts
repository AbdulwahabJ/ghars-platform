const admin = {
  settings: { title: "Settings", tabs: { users: "Users", lookups: "Lists", audit: "Activity log", export: "Export data" } },
  users: {
    title: "User management", newUser: "New user", fullName: "Full name", username: "Username", email: "Recovery email", role: "Role", status: "Status", viewFinancials: "View financial data", recordPayments: "Record payments", lastLogin: "Last login",
    active: "Active", suspended: "Suspended", yes: "Yes", no: "No", edit: "Edit", deactivate: "Deactivate", activate: "Activate", resetPassword: "Reset password",
    retentionNotice: "Users cannot be deleted to preserve historical records; they can only be deactivated. Deactivating a user immediately prevents sign-in while keeping all of their records visible.",
    operationFailed: "Could not complete the operation", unexpectedError: "An unexpected error occurred.", avatar: "Profile picture", created: "User created successfully.", saved: "Changes saved.", passwordReset: "Password reset.", passwordResetDescription: "The user's current sessions were ended and they will need to sign in again.", deactivated: "User deactivated and their sessions ended.", activated: "User reactivated.",
    createTitle: "New user", usernameLogin: "Username (for sign-in)", recoveryEmail: "Recovery email", temporaryPassword: "Temporary password", passwordHint: "At least 12 characters, including a letter and a number.", create: "Create user",
    editTitle: "Edit user {{name}}", legacyEmailNotice: "This is a legacy account without a recovery email. Add and save a valid email to enable recovery.", permissionNotice: "Permission changes apply immediately to the user's current sessions.", saveChanges: "Save changes",
    resetTitle: "Reset password for {{name}}", newPassword: "New password", resetHint: "The user's current sessions will be ended after the reset.", reset: "Reset",
    permissionDefault: "Role default", allowed: "Allowed", denied: "Not allowed",
  },
  lookup: {
    title: "Dropdown list management", category: "Category", newValue: "New value…", add: "Add", order: "Order", value: "Value", status: "Status", actions: "Actions", empty: "There are no options in this category yet.",
    active: "Active", suspended: "Inactive", referenced: "Used in records", referencedTitle: "Historical records use this value", moveUp: "Move up", moveDown: "Move down", rename: "Click to rename", deactivate: "Deactivate", activate: "Activate", delete: "Delete",
    operationFailed: "Could not complete the operation", unexpectedError: "An unexpected error occurred.", added: "Option added.", renamed: "Option renamed.", renameDescription: "Historical records retain their original value.", deleted: "Option deleted.",
    deleteReferenced: "This option cannot be deleted because records use it. You can deactivate it instead.", retentionNotice: "Deactivating an option only hides it from new lists; historical records remain unchanged. Deletion is available only for options unused in any record.",
    categories: { implant_system: "Implant systems", q_value: "Q options", former_value: "Former options", graft_value: "Graft options", procedure_tag: "Procedure tags", bone_graft_procedure_type: "Bone graft procedure types", bone_graft_material: "Bone graft materials", bone_graft_membrane: "Bone graft membranes", bone_graft_status: "Bone graft procedure statuses" },
  },
  audit: {
    recent: "Recent activity", title: "Activity log", exportCsv: "Export CSV", from: "From date", to: "To date", user: "User", action: "Action", entityType: "Record type", fileNumber: "File number", all: "All", fileNumberPlaceholder: "Example: 1001",
    time: "Time", description: "Description", empty: "No records match the selected filters.", total: "Total records: {{count}}", previous: "Previous", next: "Next", page: "Page {{page}} of {{totalPages}}",
    actions: { patient_create: "Patient added", patient_update: "Patient details updated", patient_archive: "Patient file archived", patient_restore: "Patient file restored", implant_case_create: "Implant case added", implant_case_update: "Implant case updated", implant_create: "Implant added", implant_update: "Implant updated", case_base_amount_update: "Treatment amount updated", payment_create: "Payment recorded", payment_void: "Payment voided", followup_created: "Follow-up added", followup_updated: "Follow-up updated", followup_completed: "Follow-up completed", user_create: "User created", login_success: "Signed in" },
  },
  export: { title: "Full data export (CSV)", description: "UTF-8 CSV files open directly in Excel. Exports are read-only and do not include sensitive data (no passwords or user accounts).", entities: { patients: "Patients", cases: "Implant cases", implants: "Implants", payments: "Payments", charges: "Additional charges", discounts: "Discounts", followups: "Follow-ups", communications: "Communication log" } },
} as const;
export default admin;