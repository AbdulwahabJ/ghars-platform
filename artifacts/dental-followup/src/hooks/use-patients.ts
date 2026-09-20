import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PatientBulkAction, PatientInput, PatientListQuery, PatientUpdate } from "@workspace/shared";
import {
  invalidateOperationalViews,
  invalidatePatientCreatedViews,
} from "@/lib/query-invalidation";

export const getPatientsQueryKey = (query: PatientListQuery) => ["patients", query];
export const getPatientQueryKey = (id: string) => ["patient", id];

export function usePatients(query: PatientListQuery = {}) {
  return useQuery({
    queryKey: getPatientsQueryKey(query),
    queryFn: () => api.listPatients(query),
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: getPatientQueryKey(id),
    queryFn: () => api.getPatient(id),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PatientInput) => api.createPatient(input),
    onSuccess: () => {
      void invalidatePatientCreatedViews(queryClient);
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PatientUpdate }) =>
      api.updatePatient(id, data),
    onSuccess: (response, variables) => {
      queryClient.setQueryData(getPatientQueryKey(variables.id), response);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      void invalidateOperationalViews(queryClient);
    },
  });
}

export function useArchivePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archivePatient(id),
    onSuccess: (response, id) => {
      queryClient.setQueryData(getPatientQueryKey(id), response);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      void invalidateOperationalViews(queryClient);
    },
  });
}

export function useRestorePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restorePatient(id),
    onSuccess: (response, id) => {
      queryClient.setQueryData(getPatientQueryKey(id), response);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      void invalidateOperationalViews(queryClient);
    },
  });
}

export function useBulkPatientAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PatientBulkAction) => api.bulkPatientAction(input),
    onSuccess: (response) => {
      if (response.preview) return;
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      for (const id of response.patientIds) {
        queryClient.invalidateQueries({ queryKey: getPatientQueryKey(id) });
      }
      void invalidateOperationalViews(queryClient);
    },
  });
}

export function useCheckFileNumber() {
  return useMutation({
    mutationFn: (fileNumber: string) => api.checkFileNumber(fileNumber),
  });
}
