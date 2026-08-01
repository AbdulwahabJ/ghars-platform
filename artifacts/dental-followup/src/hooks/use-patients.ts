import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PatientInput, PatientListQuery, PatientUpdate } from "@workspace/shared";

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
      queryClient.invalidateQueries({ queryKey: ["patients"] });
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
    },
  });
}

export function useCheckFileNumber() {
  return useMutation({
    mutationFn: (fileNumber: string) => api.checkFileNumber(fileNumber),
  });
}
