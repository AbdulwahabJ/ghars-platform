import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MeResponse, UpdatePreferencesInput } from "@workspace/shared";
import { ME_QUERY_KEY } from "./use-auth";

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) => api.updatePreferences(input),
    onSuccess: (response) => {
      queryClient.setQueryData(ME_QUERY_KEY, (old: MeResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          preferences: response.preferences,
        };
      });
    },
  });
}
