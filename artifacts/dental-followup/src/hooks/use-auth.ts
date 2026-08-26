import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { LoginInput, SetupInput, SwitchTenantInput } from "@workspace/shared";

export const ME_QUERY_KEY = ["me"];
export const SETUP_STATUS_QUERY_KEY = ["setup-status"];

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.me(),
    retry: false,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
  });

  const setupStatusQuery = useQuery({
    queryKey: SETUP_STATUS_QUERY_KEY,
    queryFn: () => api.getSetupStatus(),
    retry: false,
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      queryClient.clear();
    },
  });

  const setupMutation = useMutation({
    mutationFn: (input: SetupInput) => api.setup(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETUP_STATUS_QUERY_KEY });
    },
  });

  const switchTenantMutation = useMutation({
    mutationFn: (input: SwitchTenantInput) => api.switchTenant(input),
    onSuccess: (data) => {
      // Clear all tenant-scoped data, but retain ME_QUERY_KEY and SETUP_STATUS_QUERY_KEY
      queryClient.removeQueries({
        predicate: (query) =>
          !ME_QUERY_KEY.includes(query.queryKey[0] as string) &&
          !SETUP_STATUS_QUERY_KEY.includes(query.queryKey[0] as string),
      });
      // Set the new me data directly
      queryClient.setQueryData(ME_QUERY_KEY, data);
    },
  });

  return {
    user: meQuery.data?.user,
    preferences: meQuery.data?.preferences,
    currentTenant: meQuery.data?.currentTenant,
    memberships: meQuery.data?.memberships ?? [],
    isPlatformAdmin: meQuery.data?.isPlatformAdmin ?? false,
    isLoading: meQuery.isLoading,
    isError: meQuery.isError,
    setupStatus: setupStatusQuery.data,
    login: loginMutation,
    logout: logoutMutation,
    setup: setupMutation,
    switchTenant: switchTenantMutation,
  };
}
