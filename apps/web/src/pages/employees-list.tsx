import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, UserSearch, X } from 'lucide-react';
import { EMPLOYEE_STATUSES, type Employee, type EmployeeStatus } from '@asset/shared';
import { useDepartments, useEmployees } from '@/hooks/use-employees';
import { useLocations } from '@/hooks/use-masters';
import { useDebounced } from '@/hooks/use-debounced';
import { formatDate } from '@/lib/utils';
import { messageOf } from '@/lib/api-error';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ANY = '__any__';

export function EmployeesListPage(): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = React.useState(params.get('search') ?? '');
  const debouncedSearch = useDebounced(searchInput, 300);

  const page = Number(params.get('page') ?? '1');
  const status = params.get('status') ?? '';
  const department = params.get('department') ?? '';
  const locationId = params.get('locationId') ?? '';
  const holdingAssets = params.get('holdingAssets') === 'true';

  React.useEffect(() => {
    const current = params.get('search') ?? '';
    if (debouncedSearch === current) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        next.delete('page');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const setParam = (key: string, value: string): void => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value && value !== ANY) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    });
  };

  const { data, isLoading, isError, error } = useEmployees({
    page,
    pageSize: 25,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status ? { status: status as EmployeeStatus } : {}),
    ...(department ? { department } : {}),
    ...(locationId ? { locationId } : {}),
    ...(holdingAssets ? { holdingAssets: true } : {}),
  });

  const departments = useDepartments();
  const locations = useLocations();
  const hasFilters = Boolean(
    status || department || locationId || holdingAssets || debouncedSearch,
  );

  const columns = React.useMemo<ColumnDef<Employee, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Employee',
        cell: ({ row }) => (
          <div>
            <span className="font-medium">{row.original.fullName}</span>
            <span className="block text-xs text-muted-foreground">
              {row.original.employeeCode} · {row.original.email}
            </span>
          </div>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <div>
            <span>{row.original.designation}</span>
            <span className="block text-xs text-muted-foreground">{row.original.department}</span>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        cell: ({ row }) => row.original.location?.name ?? '—',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.status === 'ACTIVE' ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Exited {row.original.dateExited ? formatDate(row.original.dateExited) : ''}
            </Badge>
          ),
      },
      {
        id: 'holding',
        header: 'Holding',
        cell: ({ row }) => {
          const count = row.original.openAssignmentCount ?? 0;
          if (count === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="tabular-nums">
              {count} asset{count === 1 ? '' : 's'}
            </span>
          );
        },
      },
      {
        accessorKey: 'dateJoined',
        header: 'Joined',
        cell: ({ row }) => formatDate(row.original.dateJoined),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
        <p className="text-sm text-muted-foreground">
          People are records here, not users. Exited employees stay in the system so their history
          survives.
        </p>
      </header>

      {isError ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {messageOf(error)}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        meta={data?.meta}
        isLoading={isLoading}
        onPageChange={(nextPage) => setParam('page', String(nextPage))}
        onRowClick={(employee) => navigate(`/employees/${employee.id}`)}
        emptyState={
          <EmptyState
            icon={UserSearch}
            title={hasFilters ? 'No employees match these filters' : 'No employees yet'}
            description={
              hasFilters
                ? 'Try a different search or clear a filter.'
                : 'Employee records are added by an administrator.'
            }
            className="border-0"
          />
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search name, code, email or department"
                className="pl-9"
                aria-label="Search employees"
              />
            </div>

            <Select value={status || ANY} onValueChange={(value) => setParam('status', value)}>
              <SelectTrigger className="w-auto min-w-[130px]" aria-label="Status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All statuses</SelectItem>
                {EMPLOYEE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === 'ACTIVE' ? 'Active' : 'Exited'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={department || ANY}
              onValueChange={(value) => setParam('department', value)}
            >
              <SelectTrigger className="w-auto min-w-[150px]" aria-label="Department">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All departments</SelectItem>
                {(departments.data ?? []).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={locationId || ANY}
              onValueChange={(value) => setParam('locationId', value)}
            >
              <SelectTrigger className="w-auto min-w-[140px]" aria-label="Location">
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All locations</SelectItem>
                {(locations.data?.data ?? []).map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={holdingAssets ? 'default' : 'outline'}
              size="sm"
              onClick={() => setParam('holdingAssets', holdingAssets ? '' : 'true')}
            >
              Holding assets
            </Button>

            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  setParams(new URLSearchParams());
                }}
              >
                <X className="h-4 w-4" aria-hidden />
                Clear
              </Button>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
