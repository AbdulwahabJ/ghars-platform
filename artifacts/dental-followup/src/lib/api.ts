/**
 * Typed API request helpers.
 *
 * No OpenAPI codegen is used in this project (mandated). All contracts are
 * shared Zod schemas / TypeScript types from `@workspace/shared`, and these
 * explicit helpers are consumed by React Query on the frontend.
 */
import type {
  BaseAmountInput,
  CaseFinanceResponse,
  CaseListResponse,
  Charge,
  ChargeInput,
  Discount,
  DiscountInput,
  FinanceFilters,
  FinanceOverview,
  Payment,
  PaymentInput,
  VoidPaymentInput,
  FileNumberCheckResponse,
  HealthResponse,
  Implant,
  ImplantCase,
  ImplantCaseInput,
  ImplantCaseUpdate,
  ImplantInput,
  ImplantOptionsResponse,
  ImplantUpdate,
  LoginInput,
  MeResponse,
  Patient,
  PatientInput,
  PatientListQuery,
  PatientListResponse,
  PatientUpdate,
  Preferences,
  PublicUser,
  SetupInput,
  SetupStatus,
  UpdatePreferencesInput,
  Communication,
  CommunicationInput,
  CommunicationResultInput,
  Followup,
  FollowupInput,
  FollowupOutcome,
  FollowupPostpone,
  FollowupUpdate,
  NotificationsResponse,
  WhatsappTemplate,
  DashboardResponse,
  OperationalReportResponse,
  ReportFilters,
  StatisticsResponse,
  AdminLookupCategory,
  AdminLookupOption,
  AdminLookupsResponse,
  AdminTemplate,
  AdminTemplatesResponse,
  AdminUser,
  AdminUsersResponse,
  AppSettingsResponse,
  AuditFilters,
  AuditLogResponse,
  CreateLookupOptionInput,
  CreateUserInput,
  ExportEntity,
  ImportCommitResponse,
  ImportPreviewResponse,
  ImportRequest,
  ImportType,
  ReorderLookupOptionsInput,
  ResetPasswordInput,
  UpdateAppSettingsInput,
  UpdateLookupOptionInput,
  UpdateTemplateInput,
  UpdateUserInput,
} from "@workspace/shared";

const API_BASE = `${import.meta.env.BASE_URL}api`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  json?: unknown;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", json } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: json !== undefined ? { "Content-Type": "application/json" } : {},
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  if (!response.ok) {
    let message = "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
    let code: string | undefined;
    let data: unknown;
    try {
      data = await response.json();
      const body = data as { error?: string; code?: string };
      if (body.error) message = body.error;
      code = body.code;
    } catch {
      // Non-JSON error body — keep the generic Arabic message.
    }
    throw new ApiError(response.status, message, code, data);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  // Health
  health: () => request<HealthResponse>("/health"),

  // Auth
  getSetupStatus: () => request<SetupStatus>("/auth/setup-status"),
  setup: (input: SetupInput) =>
    request<{ user: PublicUser }>("/auth/setup", {
      method: "POST",
      json: input,
    }),
  login: (input: LoginInput) =>
    request<MeResponse>("/auth/login", { method: "POST", json: input }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<MeResponse>("/auth/me"),

  // Preferences
  updatePreferences: (input: UpdatePreferencesInput) =>
    request<{ preferences: Preferences }>("/preferences", {
      method: "PATCH",
      json: input,
    }),

  // Patients
  listPatients: (query: PatientListQuery = {}) => {
    const params = new URLSearchParams();
    if (query.query) params.set("query", query.query);
    if (query.status) params.set("status", query.status);
    if (query.page) params.set("page", String(query.page));
    if (query.pageSize) params.set("pageSize", String(query.pageSize));
    const qs = params.toString();
    return request<PatientListResponse>(`/patients${qs ? `?${qs}` : ""}`);
  },
  checkFileNumber: (fileNumber: string) =>
    request<FileNumberCheckResponse>(
      `/patients/check-file-number?fileNumber=${encodeURIComponent(fileNumber)}`,
    ),
  createPatient: (input: PatientInput) =>
    request<{ patient: Patient }>("/patients", { method: "POST", json: input }),
  getPatient: (id: string) => request<{ patient: Patient }>(`/patients/${id}`),
  updatePatient: (id: string, input: PatientUpdate) =>
    request<{ patient: Patient }>(`/patients/${id}`, {
      method: "PATCH",
      json: input,
    }),
  archivePatient: (id: string) =>
    request<{ patient: Patient }>(`/patients/${id}/archive`, {
      method: "POST",
    }),
  restorePatient: (id: string) =>
    request<{ patient: Patient }>(`/patients/${id}/restore`, {
      method: "POST",
    }),

  // Phase 2 — implant cases & implants
  getImplantOptions: () =>
    request<ImplantOptionsResponse>("/implant-options"),
  listImplantCases: (patientId: string) =>
    request<CaseListResponse>(`/patients/${patientId}/implant-cases`),
  createImplantCase: (patientId: string, input: ImplantCaseInput) =>
    request<{ case: ImplantCase }>(`/patients/${patientId}/implant-cases`, {
      method: "POST",
      json: input,
    }),
  updateImplantCase: (id: string, input: ImplantCaseUpdate) =>
    request<{ case: ImplantCase }>(`/implant-cases/${id}`, {
      method: "PATCH",
      json: input,
    }),
  archiveImplantCase: (id: string) =>
    request<{ case: ImplantCase }>(`/implant-cases/${id}/archive`, {
      method: "POST",
    }),
  restoreImplantCase: (id: string) =>
    request<{ case: ImplantCase }>(`/implant-cases/${id}/restore`, {
      method: "POST",
    }),
  createImplant: (caseId: string, input: ImplantInput) =>
    request<{ implant: Implant }>(`/implant-cases/${caseId}/implants`, {
      method: "POST",
      json: input,
    }),
  updateImplant: (id: string, input: ImplantUpdate) =>
    request<{ implant: Implant }>(`/implants/${id}`, {
      method: "PATCH",
      json: input,
    }),
  archiveImplant: (id: string) =>
    request<{ implant: Implant }>(`/implants/${id}/archive`, {
      method: "POST",
    }),

  // Phase 3 — financial tracking
  getCaseFinance: (caseId: string) =>
    request<CaseFinanceResponse>(`/implant-cases/${caseId}/finance`),
  updateBaseAmount: (caseId: string, input: BaseAmountInput) =>
    request<{ baseTreatmentAmount: number }>(
      `/implant-cases/${caseId}/base-amount`,
      { method: "PATCH", json: input },
    ),
  createCharge: (caseId: string, input: ChargeInput) =>
    request<{ charge: Charge }>(`/implant-cases/${caseId}/charges`, {
      method: "POST",
      json: input,
    }),
  deleteCharge: (id: string) =>
    request<void>(`/charges/${id}`, { method: "DELETE" }),
  createDiscount: (caseId: string, input: DiscountInput) =>
    request<{ discount: Discount }>(`/implant-cases/${caseId}/discounts`, {
      method: "POST",
      json: input,
    }),
  deleteDiscount: (id: string) =>
    request<void>(`/discounts/${id}`, { method: "DELETE" }),
  createPayment: (caseId: string, input: PaymentInput) =>
    request<{ payment: Payment }>(`/implant-cases/${caseId}/payments`, {
      method: "POST",
      json: input,
    }),
  voidPayment: (id: string, input: VoidPaymentInput) =>
    request<{ payment: Payment }>(`/payments/${id}/void`, {
      method: "POST",
      json: input,
    }),
  getFinanceOverview: (filters: FinanceFilters) =>
    request<FinanceOverview>(`/finance/overview?${financeQs(filters)}`),
  getFollowups: (patientId: string) =>
    request<{ followups: Followup[] }>(`/patients/${patientId}/followups`),
  createFollowup: (caseId: string, input: FollowupInput) =>
    request<{ followup: Followup }>(`/implant-cases/${caseId}/followups`, {
      method: "POST",
      json: input,
    }),
  updateFollowup: (id: string, input: FollowupUpdate) =>
    request<{ followup: Followup }>(`/followups/${id}`, {
      method: "PATCH",
      json: input,
    }),
  recordFollowupOutcome: (id: string, input: FollowupOutcome) =>
    request<{ followup: Followup }>(`/followups/${id}/outcome`, {
      method: "POST",
      json: input,
    }),
  postponeFollowup: (id: string, input: FollowupPostpone) =>
    request<{ followup: Followup; newFollowup: Followup }>(
      `/followups/${id}/postpone`,
      { method: "POST", json: input },
    ),
  getCommunications: (patientId: string) =>
    request<{ communications: Communication[] }>(
      `/patients/${patientId}/communications`,
    ),
  createCommunication: (patientId: string, input: CommunicationInput) =>
    request<{ communication: Communication }>(
      `/patients/${patientId}/communications`,
      { method: "POST", json: input },
    ),
  recordCommunicationResult: (id: string, input: CommunicationResultInput) =>
    request<{ communication: Communication }>(
      `/communications/${id}/result`,
      { method: "PATCH", json: input },
    ),
  getWhatsappTemplates: () =>
    request<{ templates: WhatsappTemplate[] }>(`/whatsapp-templates`),
  getAssignableUsers: () =>
    request<{ users: Array<{ id: string; fullName: string; role: string }> }>(
      `/users/assignable`,
    ),
  getNotifications: () => request<NotificationsResponse>(`/notifications`),
  getDashboard: () => request<DashboardResponse>(`/dashboard`),
  getStatistics: (filters: ReportFilters) =>
    request<StatisticsResponse>(`/statistics?${reportQs(filters)}`),
  getOperationalReport: (filters: ReportFilters) =>
    request<OperationalReportResponse>(
      `/reports/operational?${reportQs(filters)}`,
    ),

  // Application settings (all authenticated users)
  getAppSettings: () => request<AppSettingsResponse>(`/settings`),
  updateAppSettings: (input: UpdateAppSettingsInput) =>
    request<AppSettingsResponse>(`/admin/settings`, {
      method: "PATCH",
      json: input,
    }),

  // Admin: users
  adminListUsers: () => request<AdminUsersResponse>(`/admin/users`),
  adminCreateUser: (input: CreateUserInput) =>
    request<{ user: AdminUser }>(`/admin/users`, {
      method: "POST",
      json: input,
    }),
  adminUpdateUser: (id: string, input: UpdateUserInput) =>
    request<{ user: AdminUser }>(`/admin/users/${id}`, {
      method: "PATCH",
      json: input,
    }),
  adminActivateUser: (id: string) =>
    request<{ user: AdminUser }>(`/admin/users/${id}/activate`, {
      method: "POST",
    }),
  adminDeactivateUser: (id: string) =>
    request<{ user: AdminUser }>(`/admin/users/${id}/deactivate`, {
      method: "POST",
    }),
  adminResetPassword: (id: string, input: ResetPasswordInput) =>
    request<void>(`/admin/users/${id}/reset-password`, {
      method: "POST",
      json: input,
    }),

  // Admin: lookups
  adminListLookups: () => request<AdminLookupsResponse>(`/admin/lookups`),
  adminCreateLookup: (input: CreateLookupOptionInput) =>
    request<{ option: AdminLookupOption }>(`/admin/lookups`, {
      method: "POST",
      json: input,
    }),
  adminUpdateLookup: (
    category: AdminLookupCategory,
    id: string,
    input: UpdateLookupOptionInput,
  ) =>
    request<void>(`/admin/lookups/${category}/${id}`, {
      method: "PATCH",
      json: input,
    }),
  adminSetLookupActive: (
    category: AdminLookupCategory,
    id: string,
    active: boolean,
  ) =>
    request<void>(
      `/admin/lookups/${category}/${id}/${active ? "activate" : "deactivate"}`,
      { method: "POST" },
    ),
  adminDeleteLookup: (category: AdminLookupCategory, id: string) =>
    request<void>(`/admin/lookups/${category}/${id}`, { method: "DELETE" }),
  adminReorderLookups: (input: ReorderLookupOptionsInput) =>
    request<void>(`/admin/lookups/reorder`, { method: "POST", json: input }),

  // Admin: WhatsApp templates
  adminListTemplates: () =>
    request<AdminTemplatesResponse>(`/admin/whatsapp-templates`),
  adminUpdateTemplate: (id: string, input: UpdateTemplateInput) =>
    request<{ template: AdminTemplate }>(`/admin/whatsapp-templates/${id}`, {
      method: "PATCH",
      json: input,
    }),
  adminSetTemplateActive: (id: string, active: boolean) =>
    request<{ template: AdminTemplate }>(
      `/admin/whatsapp-templates/${id}/${active ? "activate" : "deactivate"}`,
      { method: "POST" },
    ),

  // Admin: audit logs
  adminListAuditLogs: (filters: Partial<AuditFilters>) =>
    request<AuditLogResponse>(`/admin/audit-logs?${auditQs(filters)}`),

  // Admin: legacy import
  adminImportPreview: (input: ImportRequest) =>
    request<ImportPreviewResponse>(`/admin/import/preview`, {
      method: "POST",
      json: input,
    }),
  adminImportCommit: (input: ImportRequest) =>
    request<ImportCommitResponse>(`/admin/import/commit`, {
      method: "POST",
      json: input,
    }),
};

export function auditQs(filters: Partial<AuditFilters>): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.userId) params.set("userId", filters.userId);
  if (filters.action) params.set("action", filters.action);
  if (filters.entityType) params.set("entityType", filters.entityType);
  if (filters.fileNumber) params.set("fileNumber", filters.fileNumber);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  return params.toString();
}

/** URL for the audit log CSV export (browser download). */
export function auditExportUrl(filters: Partial<AuditFilters>): string {
  return `${API_BASE}/admin/audit-logs/export.csv?${auditQs(filters)}`;
}

/** URL for a full-data CSV export of one entity (browser download). */
export function dataExportUrl(entity: ExportEntity): string {
  return `${API_BASE}/admin/export/${entity}.csv`;
}

/** URL for an import CSV template download. */
export function importTemplateUrl(type: ImportType): string {
  return `${API_BASE}/admin/import/template/${type}.csv`;
}

export function reportQs(filters: ReportFilters): string {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.treatingDoctor) params.set("treatingDoctor", filters.treatingDoctor);
  if (filters.implantSystem) params.set("implantSystem", filters.implantSystem);
  if (filters.caseStatus) params.set("caseStatus", filters.caseStatus);
  return params.toString();
}

/** URL for the operational report CSV export (browser download). */
export function operationalExportUrl(filters: ReportFilters): string {
  return `${API_BASE}/reports/operational/export.csv?${reportQs(filters)}`;
}

export function financeQs(filters: FinanceFilters): string {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.patientName) params.set("patientName", filters.patientName);
  if (filters.fileNumber) params.set("fileNumber", filters.fileNumber);
  if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (filters.implantSystem) params.set("implantSystem", filters.implantSystem);
  return params.toString();
}

/** URL for the CSV export (opened directly so the browser downloads it). */
export function financeExportUrl(filters: FinanceFilters): string {
  return `${API_BASE}/finance/export.csv?${financeQs(filters)}`;
}
