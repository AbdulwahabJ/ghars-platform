import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PatientAttachmentUpdate } from "@workspace/shared";

export const getPatientAttachmentsQueryKey = (patientId: string) => ["patient-attachments", patientId];

export function usePatientAttachments(patientId: string) {
  return useQuery({
    queryKey: getPatientAttachmentsQueryKey(patientId),
    queryFn: ({ signal }) => api.getPatientAttachments(patientId, signal),
    enabled: !!patientId,
    staleTime: 30_000,
  });
}

export function useUpdatePatientAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ patientId, attachmentId, data }: { patientId: string; attachmentId: string; data: PatientAttachmentUpdate }) =>
      api.updatePatientAttachment(patientId, attachmentId, data),
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: getPatientAttachmentsQueryKey(variables.patientId) });
    },
  });
}

export function useDeletePatientAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ patientId, attachmentId }: { patientId: string; attachmentId: string }) =>
      api.deletePatientAttachment(patientId, attachmentId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: getPatientAttachmentsQueryKey(variables.patientId) });
    },
  });
}
