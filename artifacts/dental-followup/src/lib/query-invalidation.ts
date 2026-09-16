import type { QueryClient } from "@tanstack/react-query";

/**
 * Query invalidation is kept at the domain boundary: both the patient file
 * and the operational table mutate the same API records, then refresh the
 * views that derive from those records.
 */
export function invalidateOperationalViews(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["operational-report"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["statistics"] }),
  ]);
}

export function invalidatePatientCreatedViews(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["patients"] }),
    invalidateOperationalViews(queryClient),
  ]);
}

export function invalidatePatientRecordViews(
  queryClient: QueryClient,
  patientId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["patient", patientId] }),
    queryClient.invalidateQueries({
      queryKey: ["patient", patientId, "implant-cases"],
    }),
    invalidateOperationalViews(queryClient),
  ]);
}

export function invalidateFinancialViews(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["finance-overview"] }),
    queryClient.invalidateQueries({ queryKey: ["operational-report"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["statistics"] }),
  ]);
}

export function invalidateFollowupViews(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    queryClient.invalidateQueries({ queryKey: ["operational-report"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["statistics"] }),
  ]);
}