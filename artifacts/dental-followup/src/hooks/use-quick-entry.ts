import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { QuickEntryInput } from "@workspace/shared";

export function useQuickEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickEntryInput) => api.quickEntry(input),
    onSuccess: () => {
      // Invalidate all tables that might be affected
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["operational-report"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
    },
  });
}
