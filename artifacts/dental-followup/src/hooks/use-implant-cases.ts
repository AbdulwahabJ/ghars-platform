import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ImplantCaseInput,
  ImplantCaseUpdate,
  ImplantInput,
  ImplantUpdate,
  ProstheticEventInput,
} from "@workspace/shared";
import { invalidateOperationalViews } from "@/lib/query-invalidation";

export const getImplantCasesQueryKey = (patientId: string) =>
  ["patient", patientId, "implant-cases"] as const;

export function useImplantOptions() {
  return useQuery({
    queryKey: ["implant-options"],
    queryFn: () => api.getImplantOptions(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useImplantCases(patientId: string) {
  return useQuery({
    queryKey: getImplantCasesQueryKey(patientId),
    queryFn: () => api.listImplantCases(patientId),
    enabled: Boolean(patientId),
  });
}

function useInvalidateCases() {
  const queryClient = useQueryClient();
  return async (patientId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getImplantCasesQueryKey(patientId),
      }),
      invalidateOperationalViews(queryClient),
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
