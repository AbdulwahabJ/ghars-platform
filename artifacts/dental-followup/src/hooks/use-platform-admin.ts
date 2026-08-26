import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PlatformTenantListInput, ExtendTrialInput, ResolveActivationRequestInput, ResetPasswordInput } from "@workspace/shared";

export const PLATFORM_TENANTS_KEY = ["platform-tenants"];
export const PLATFORM_TENANT_DETAIL_KEY = (id: string) => ["platform-tenant", id];

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
