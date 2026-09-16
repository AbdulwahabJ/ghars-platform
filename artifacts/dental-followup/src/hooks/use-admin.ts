import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminLookupCategory,
  AuditFilters,
  CreateLookupOptionInput,
  CreateUserInput,
  ImportRequest,
  ReorderLookupOptionsInput,
  ResetPasswordInput,
  UpdateAppSettingsInput,
  UpdateLookupOptionInput,
  UpdateTemplateInput,
  UpdateUserInput,
  UniversalImportInput,
  UniversalImportMappingPatch,
  UniversalImportCommit,
} from "@workspace/shared";
import { api } from "@/lib/api";
import { APP_SETTINGS_QUERY_KEY } from "./use-settings";

export const ADMIN_USERS_KEY = ["admin", "users"];
export const ADMIN_LOOKUPS_KEY = ["admin", "lookups"];
export const ADMIN_TEMPLATES_KEY = ["admin", "templates"];

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export function useAdminUsers() {
  return useQuery({
    queryKey: ADMIN_USERS_KEY,
    queryFn: () => api.adminListUsers(),
  });
}

export function useAdminUserMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });

  const create = useMutation({
    mutationFn: (input: CreateUserInput) => api.adminCreateUser(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      api.adminUpdateUser(id, input),
    onSuccess: invalidate,
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? api.adminActivateUser(id) : api.adminDeactivateUser(id),
    onSuccess: invalidate,
  });
  const resetPassword = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResetPasswordInput }) =>
      api.adminResetPassword(id, input),
  });
  return { create, update, setActive, resetPassword };
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAppSettingsInput) =>
      api.updateAppSettings(input),
    onSuccess: (response) => {
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, response);
    },
  });
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export function useAdminLookups() {
  return useQuery({
    queryKey: ADMIN_LOOKUPS_KEY,
    queryFn: () => api.adminListLookups(),
  });
}

export function useAdminLookupMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_LOOKUPS_KEY });
    // User-facing dropdowns read from /implant-options.
    queryClient.invalidateQueries({ queryKey: ["implant-options"] });
  };

  const create = useMutation({
    mutationFn: (input: CreateLookupOptionInput) =>
      api.adminCreateLookup(input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({
      category,
      id,
      input,
    }: {
      category: AdminLookupCategory;
      id: string;
      input: UpdateLookupOptionInput;
    }) => api.adminUpdateLookup(category, id, input),
    onSuccess: invalidate,
  });
  const setActive = useMutation({
    mutationFn: ({
      category,
      id,
      active,
    }: {
      category: AdminLookupCategory;
      id: string;
      active: boolean;
    }) => api.adminSetLookupActive(category, id, active),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({
      category,
      id,
    }: {
      category: AdminLookupCategory;
      id: string;
    }) => api.adminDeleteLookup(category, id),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (input: ReorderLookupOptionsInput) =>
      api.adminReorderLookups(input),
    onSuccess: invalidate,
  });
  return { create, update, setActive, remove, reorder };
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export function useAdminTemplates() {
  return useQuery({
    queryKey: ADMIN_TEMPLATES_KEY,
    queryFn: () => api.adminListTemplates(),
  });
}

export function useAdminTemplateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ADMIN_TEMPLATES_KEY });
    queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
  };
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTemplateInput }) =>
      api.adminUpdateTemplate(id, input),
    onSuccess: invalidate,
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.adminSetTemplateActive(id, active),
    onSuccess: invalidate,
  });
  return { update, setActive };
}

/* ------------------------------------------------------------------ */
/* Audit logs                                                          */
/* ------------------------------------------------------------------ */

export function useAuditLogs(filters: Partial<AuditFilters>) {
  return useQuery({
    queryKey: ["admin", "audit-logs", filters],
    queryFn: () => api.adminListAuditLogs(filters),
    placeholderData: (prev) => prev,
  });
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export function useImportPreview() {
  return useMutation({
    mutationFn: (input: ImportRequest) => api.adminImportPreview(input),
  });
}

export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportRequest) => api.adminImportCommit(input),
    onSuccess: () => {
      // Imported data affects nearly every list in the app.
      queryClient.invalidateQueries();
    },
  });
}

export function useUniversalImportAnalyze() {
  return useMutation({
    mutationFn: (input: UniversalImportInput) => api.universalImportAnalyze(input),
  });
}

export function useUniversalImportGetBatch(id: string | null) {
  return useQuery({
    queryKey: ["admin", "universal-import", id],
    queryFn: () => api.universalImportGetBatch(id!),
    enabled: !!id,
  });
}

export function useUniversalImportPatchMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UniversalImportMappingPatch }) =>
      api.universalImportPatchMapping(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "universal-import", data.id], data);
    },
  });
}

export function useUniversalImportCommitBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UniversalImportCommit }) =>
      api.universalImportCommitBatch(id, input),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "universal-import", data.batch.id], data.batch);
      queryClient.invalidateQueries();
    },
  });
}

export function useUniversalImportRollbackBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.universalImportRollbackBatch(id),
    onSuccess: (data) => {
      queryClient.setQueryData(["admin", "universal-import", data.batch.id], data.batch);
      queryClient.invalidateQueries();
    },
  });
}
