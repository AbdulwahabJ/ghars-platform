import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ImplantCaseInput,
  ImplantCaseUpdate,
  ImplantInput,
  ImplantUpdate,
  ProstheticEventInput,
  BoneGraftProcedureInput,
  BoneGraftProcedureUpdate,
} from "@workspace/shared";
import { invalidatePatientRecordViews, invalidateOperationalViews } from "@/lib/query-invalidation";

export const getImplantCasesQueryKey = (patientId: string) =>
  ["patient", patientId, "implant-cases"] as const;

export function useImplantOptions() {
  return useQuery({
    queryKey: ["implant-options"],
    queryFn: ({ signal }) => api.getImplantOptions(signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useImplantCases(patientId: string) {
  return useQuery({
    queryKey: getImplantCasesQueryKey(patientId),
    queryFn: ({ signal }) => api.listImplantCases(patientId, signal),
    enabled: Boolean(patientId),
    staleTime: 30_000,
  });
}

function useInvalidateCases() {
  const queryClient = useQueryClient();
  return async (patientId: string) => {
    await Promise.all([
      invalidatePatientRecordViews(queryClient, patientId),
    ]);
  };
}

export function useCreateImplantCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({
      patientId,
      data,
    }: {
      patientId: string;
      data: ImplantCaseInput;
    }) => api.createImplantCase(patientId, data),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useUpdateImplantCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      patientId: string;
      data: ImplantCaseUpdate;
    }) => api.updateImplantCase(id, data),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useArchiveImplantCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({ id }: { id: string; patientId: string }) =>
      api.archiveImplantCase(id),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useRestoreImplantCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({ id }: { id: string; patientId: string }) =>
      api.restoreImplantCase(id),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useBulkPermanentDeleteCases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { caseIds: string[]; preview: boolean; confirmed?: boolean; previewToken?: string }) =>
      api.bulkPermanentDeleteCases(input),
    onSuccess: (response, variables) => {
      if (response.preview || !variables.confirmed) return;
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["patient"] });
      void invalidateOperationalViews(queryClient);
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      for (const id of variables.caseIds) {
        queryClient.removeQueries({ queryKey: ["case-finance", id] });
      }
    },
  });
}

export function useCreateImplant() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({
      caseId,
      data,
    }: {
      caseId: string;
      patientId: string;
      data: ImplantInput;
    }) => api.createImplant(caseId, data),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useUpdateImplant() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      patientId: string;
      data: ImplantUpdate;
    }) => api.updateImplant(id, data),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useArchiveImplant() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({ id }: { id: string; patientId: string }) =>
      api.archiveImplant(id),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useCreateProstheticEvent() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({
      caseId,
      data,
    }: {
      caseId: string;
      patientId: string;
      data: ProstheticEventInput;
    }) => api.createProstheticEvent(caseId, data),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useArchiveProstheticEvent() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({ id }: { id: string; patientId: string }) =>
      api.archiveProstheticEvent(id),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useCreateBoneGraftProcedure() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({
      caseId,
      data,
    }: {
      caseId: string;
      patientId: string;
      data: BoneGraftProcedureInput;
    }) => api.createBoneGraftProcedure(caseId, data),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useUpdateBoneGraftProcedure() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      patientId: string;
      data: BoneGraftProcedureUpdate;
    }) => api.updateBoneGraftProcedure(id, data),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}

export function useArchiveBoneGraftProcedure() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: ({ id }: { id: string; patientId: string }) =>
      api.archiveBoneGraftProcedure(id),
    onSuccess: (_res, vars) => invalidate(vars.patientId),
  });
}
