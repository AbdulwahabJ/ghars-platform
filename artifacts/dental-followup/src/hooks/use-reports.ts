import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportFilters } from "@workspace/shared";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.getDashboard(),
    refetchInterval: 60_000,
  });
}

export function useStatistics(filters: ReportFilters) {
  return useQuery({
    queryKey: ["statistics", filters],
    queryFn: () => api.getStatistics(filters),
  });
}

export function useOperationalReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["operational-report", filters],
    queryFn: () => api.getOperationalReport(filters),
  });
}
