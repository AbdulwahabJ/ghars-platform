import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  PlatformTenantListInput,
  ExtendTrialInput,
  ResolveActivationRequestInput,
  ResetPasswordInput,
  PlatformTrialsInput,
  PlatformActivationRequestsInput,
  PlatformErrorsInput,
  PlatformAuditInput,
  UpdateActivationWorkflowInput,
  ResolvePlatformErrorInput,
  UpdatePlatformSettingsInput,
} from "@workspace/shared";

export const PLATFORM_TENANTS_KEY = ["platform-tenants"];
export const PLATFORM_TENANT_DETAIL_KEY = (id: string) => ["platform-tenant", id];
export const PLATFORM_OVERVIEW_KEY = ["platform-overview"];
export const PLATFORM_TRIALS_KEY = ["platform-trials"];
export const PLATFORM_ACTIVATION_REQUESTS_KEY = ["platform-activation-requests"];
export const PLATFORM_ERRORS_KEY = ["platform-errors"];
export const PLATFORM_HEALTH_KEY = ["platform-health"];
export const PLATFORM_AUDIT_KEY = ["platform-audit"];
export const PLATFORM_SETTINGS_KEY = ["platform-settings"];

export function usePlatformOverview() {
  return useQuery({
    queryKey: PLATFORM_OVERVIEW_KEY,
    queryFn: () => api.platformGetOverview(),
    retry: false,
  });
}

export function usePlatformTrials(query: PlatformTrialsInput) {
  return useQuery({
    queryKey: [...PLATFORM_TRIALS_KEY, query],
    queryFn: () => api.platformGetTrials(query),
    retry: false,
  });
}

export function usePlatformActivationRequests(query: PlatformActivationRequestsInput) {
  return useQuery({
    queryKey: [...PLATFORM_ACTIVATION_REQUESTS_KEY, query],
    queryFn: () => api.platformGetActivationRequests(query),
    retry: false,
  });
}

export function usePlatformErrors(query: PlatformErrorsInput) {
  return useQuery({
    queryKey: [...PLATFORM_ERRORS_KEY, query],
    queryFn: () => api.platformGetErrors(query),
    retry: false,
  });
}

export function usePlatformHealth() {
  return useQuery({
    queryKey: PLATFORM_HEALTH_KEY,
    queryFn: () => api.platformGetHealth(),
    retry: false,
  });
}

export function usePlatformAudit(filters: PlatformAuditInput) {
  return useQuery({
    queryKey: [...PLATFORM_AUDIT_KEY, filters],
    queryFn: () => api.platformGetAudit(filters),
    retry: false,
  });
}

export function usePlatformSettings() {
  return useQuery({
    queryKey: PLATFORM_SETTINGS_KEY,
    queryFn: () => api.platformGetSettings(),
    retry: false,
  });
}

export function usePlatformUpdateActivationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateActivationWorkflowInput }) =>
      api.platformUpdateActivationRequest(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_ACTIVATION_REQUESTS_KEY });
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANTS_KEY });
    },
  });
}

export function usePlatformResolveError() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ResolvePlatformErrorInput }) =>
      api.platformResolveError(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_ERRORS_KEY });
    },
  });
}

export function usePlatformUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePlatformSettingsInput) => api.platformUpdateSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_SETTINGS_KEY });
    },
  });
}

export function usePlatformTenants(query: PlatformTenantListInput) {
  return useQuery({
    queryKey: [...PLATFORM_TENANTS_KEY, query],
    queryFn: () => api.platformListTenants(query),
    retry: false,
  });
}

export function usePlatformTenant(id: string) {
  return useQuery({
    queryKey: PLATFORM_TENANT_DETAIL_KEY(id),
    queryFn: () => api.platformGetTenant(id),
    enabled: !!id,
    retry: false,
  });
}

export function usePlatformActivateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.platformActivateTenant(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANT_DETAIL_KEY(id) });
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANTS_KEY });
    },
  });
}

export function usePlatformSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.platformSuspendTenant(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANT_DETAIL_KEY(id) });
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANTS_KEY });
    },
  });
}

export function usePlatformReactivateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.platformReactivateTenant(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANT_DETAIL_KEY(id) });
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANTS_KEY });
    },
  });
}

export function usePlatformExtendTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ExtendTrialInput }) =>
      api.platformExtendTrial(id, input),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANT_DETAIL_KEY(id) });
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANTS_KEY });
    },
  });
}

export function usePlatformResolveActivationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      input,
      tenantId,
    }: {
      id: string;
      action: "approve" | "reject";
      input: ResolveActivationRequestInput;
      tenantId: string;
    }) => api.platformResolveActivationRequest(id, action, input),
    onSuccess: (_, { tenantId }) => {
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANT_DETAIL_KEY(tenantId) });
      queryClient.invalidateQueries({ queryKey: PLATFORM_TENANTS_KEY });
    },
  });
}

export function usePlatformResetTenantAdminPassword() {
  return useMutation({
    mutationFn: ({
      tenantId,
      userId,
      input,
    }: {
      tenantId: string;
      userId: string;
      input: ResetPasswordInput;
    }) => api.platformResetTenantAdminPassword(tenantId, userId, input),
  });
}
