import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardSummary } from '@asset/shared';
import { api } from '@/lib/api-client';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => [...dashboardKeys.all, 'summary'] as const,
};

/** All server state goes through TanStack Query, never useState (CLAUDE.md §3). */
export function useDashboardSummary(): UseQueryResult<DashboardSummary> {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: ({ signal }) => api.get<DashboardSummary>('/dashboard/summary', undefined, signal),
    staleTime: 60_000,
  });
}
