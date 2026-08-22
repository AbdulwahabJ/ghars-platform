import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CommunicationInput,
  CommunicationResultInput,
  FollowupInput,
  FollowupOutcome,
  FollowupPostpone,
  FollowupUpdate,
} from "@workspace/shared";
import { api } from "@/lib/api";
import { invalidateFollowupViews } from "@/lib/query-invalidation";

export const getFollowupsQueryKey = (patientId: string) =>
  ["patient", patientId, "followups"] as const;
export const getCommunicationsQueryKey = (patientId: string) =>
  ["patient", patientId, "communications"] as const;
export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;

export function useFollowups(patientId: string) {
  return useQuery({
    queryKey: getFollowupsQueryKey(patientId),
    queryFn: () => api.getFollowups(patientId),
    select: (data) => data.followups,
  });
}

export function useCommunications(patientId: string) {
  return useQuery({
    queryKey: getCommunicationsQueryKey(patientId),
    queryFn: () => api.getCommunications(patientId),
    select: (data) => data.communications,
  });
}

export function useWhatsappTemplates() {
  return useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => api.getWhatsappTemplates(),
    select: (data) => data.templates,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAssignableUsers() {
  return useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => api.getAssignableUsers(),
    select: (data) => data.users,
    staleTime: 5 * 60 * 1000,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => api.getNotifications(),
    refetchInterval: 60_000,
  });
}

function useInvalidateFollowups(patientId: string) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
      queryKey: getFollowupsQueryKey(patientId),
      }),
      invalidateFollowupViews(queryClient),
    ]);
  };
}

export function useCreateFollowup(patientId: string) {
  const invalidate = useInvalidateFollowups(patientId);
  return useMutation({
    mutationFn: ({ caseId, input }: { caseId: string; input: FollowupInput }) =>
      api.createFollowup(caseId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateFollowup(patientId: string) {
  const invalidate = useInvalidateFollowups(patientId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FollowupUpdate }) =>
      api.updateFollowup(id, input),
    onSuccess: invalidate,
  });
}

export function useFollowupOutcome(patientId: string) {
  const invalidate = useInvalidateFollowups(patientId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FollowupOutcome }) =>
      api.recordFollowupOutcome(id, input),
    onSuccess: invalidate,
  });
}

export function usePostponeFollowup(patientId: string) {
  const invalidate = useInvalidateFollowups(patientId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FollowupPostpone }) =>
      api.postponeFollowup(id, input),
    onSuccess: invalidate,
  });
}

export function useCreateCommunication(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CommunicationInput) =>
      api.createCommunication(patientId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getCommunicationsQueryKey(patientId),
      });
    },
  });
}

export function useRecordCommunicationResult(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: CommunicationResultInput;
    }) => api.recordCommunicationResult(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: getCommunicationsQueryKey(patientId),
      });
    },
  });
}
