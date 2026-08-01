/**
 * Typed API request helpers.
 *
 * No OpenAPI codegen is used in this project (mandated). All contracts are
 * shared Zod schemas / TypeScript types from `@workspace/shared`, and these
 * explicit helpers are consumed by React Query on the frontend.
 */
import type {
  CaseListResponse,
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
};
