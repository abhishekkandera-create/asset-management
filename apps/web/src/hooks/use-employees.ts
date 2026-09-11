import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  Assignment,
  Clearance,
  CreateEmployee,
  Employee,
  EmployeeHoldings,
  ExitEmployee,
  ListEmployeesQuery,
  Paginated,
  WriteOffAssignment,
} from '@asset/shared';
import { api } from '@/lib/api-client';
import { assetKeys } from './use-assets';
import { dashboardKeys } from './use-dashboard';

export const employeeKeys = {
  all: ['employees'] as const,
  lists: () => [...employeeKeys.all, 'list'] as const,
  list: (query: Partial<ListEmployeesQuery>) => [...employeeKeys.lists(), query] as const,
  detail: (id: string) => [...employeeKeys.all, 'detail', id] as const,
  holdings: (id: string) => [...employeeKeys.detail(id), 'holdings'] as const,
  assignments: (id: string, page: number) =>
    [...employeeKeys.detail(id), 'assignments', page] as const,
  clearance: (id: string) => [...employeeKeys.detail(id), 'clearance'] as const,
  departments: () => [...employeeKeys.all, 'departments'] as const,
};

export function useEmployees(
  query: Partial<ListEmployeesQuery>,
): UseQueryResult<Paginated<Employee>> {
  return useQuery({
    queryKey: employeeKeys.list(query),
    queryFn: ({ signal }) => api.get<Paginated<Employee>>('/employees', query as never, signal),
    placeholderData: (previous) => previous,
  });
}

export function useEmployee(id: string | undefined): UseQueryResult<Employee> {
  return useQuery({
    queryKey: employeeKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<Employee>(`/employees/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useEmployeeHoldings(id: string | undefined): UseQueryResult<EmployeeHoldings> {
  return useQuery({
    queryKey: employeeKeys.holdings(id ?? ''),
    queryFn: ({ signal }) =>
      api.get<EmployeeHoldings>(`/employees/${id}/assets`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useEmployeeAssignments(
  id: string | undefined,
  page = 1,
): UseQueryResult<Paginated<Assignment>> {
  return useQuery({
    queryKey: employeeKeys.assignments(id ?? '', page),
    queryFn: ({ signal }) =>
      api.get<Paginated<Assignment>>(
        `/employees/${id}/assignments`,
        { page, pageSize: 25 },
        signal,
      ),
    enabled: Boolean(id),
  });
}

export function useEmployeeClearance(id: string | undefined): UseQueryResult<Clearance> {
  return useQuery({
    queryKey: employeeKeys.clearance(id ?? ''),
    queryFn: ({ signal }) => api.get<Clearance>(`/employees/${id}/clearance`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useDepartments(): UseQueryResult<string[]> {
  return useQuery({
    queryKey: employeeKeys.departments(),
    queryFn: ({ signal }) => api.get<string[]>('/employees/departments', undefined, signal),
    staleTime: 10 * 60_000,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEmployee) => api.post<Employee>('/employees', body),
    onSuccess: () => {
      // The new person changes the list, the department filter options and the
      // active-employee count on the dashboard.
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useExitEmployee(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExitEmployee) => api.post<Employee>(`/employees/${id}/exit`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

export function useWriteOffAssignment(employeeId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assignmentId, ...body }: WriteOffAssignment & { assignmentId: string }) =>
      api.post<Assignment>(`/assignments/${assignmentId}/write-off`, body),
    onSuccess: () => {
      if (employeeId)
        void queryClient.invalidateQueries({ queryKey: employeeKeys.detail(employeeId) });
      void queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      void queryClient.invalidateQueries({ queryKey: assetKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}
