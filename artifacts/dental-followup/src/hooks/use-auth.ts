import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { LoginInput, SetupInput } from "@workspace/shared";

export const ME_QUERY_KEY = ["me"];
export const SETUP_STATUS_QUERY_KEY = ["setup-status"];

export function useAuth() {
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => api.me(),
    retry: false,
    staleTime: Infinity,
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

  return {
    user: meQuery.data?.user,
    preferences: meQuery.data?.preferences,
    isLoading: meQuery.isLoading,
    isError: meQuery.isError,
    setupStatus: setupStatusQuery.data,
    login: loginMutation,
    logout: logoutMutation,
    setup: setupMutation,
  };
}
