import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ReportFilters } from "@workspace/shared";

const ROUTE_DATA_STALE_TIME = 30_000;

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => api.getDashboard(signal),
    refetchInterval: 60_000,
    staleTime: ROUTE_DATA_STALE_TIME,
  });
}

export function useStatistics(filters: ReportFilters) {
  const { search: _search, ...statisticsFilters } = filters;
  return useQuery({
    queryKey: ["statistics", statisticsFilters],
    queryFn: ({ signal }) => api.getStatistics(statisticsFilters, signal),
    staleTime: ROUTE_DATA_STALE_TIME,
  });
}

export function useOperationalReport(filters: ReportFilters) {
  return useQuery({
    queryKey: ["operational-report", filters],
    queryFn: ({ signal }) => api.getOperationalReport(filters, signal),
    placeholderData: (previous) => previous,
    staleTime: ROUTE_DATA_STALE_TIME,
  });
}
