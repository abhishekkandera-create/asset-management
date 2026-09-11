import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import type { Employee } from '@asset/shared';
import { useEmployees } from '@/hooks/use-employees';
import { useDebounced } from '@/hooks/use-debounced';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface EmployeePickerProps {
  /** The selected employee itself, not an id — the parent already has it. */
  value: Employee | null;
  onChange: (employee: Employee) => void;
  /** Hidden from the results — used to exclude the current holder on transfer. */
  excludeEmployeeId?: string | undefined;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}

/**
 * Type-ahead over active employees. Exited employees are never listed: an
 * asset cannot be issued to one (CLAUDE.md §7.2), so offering them would only
 * produce a 422 the user cannot act on.
 */
export function EmployeePicker({
  value,
  onChange,
  excludeEmployeeId,
  placeholder = 'Search by name, code or email',
  invalid = false,
  disabled = false,
}: EmployeePickerProps): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const debouncedSearch = useDebounced(search, 250);

  const { data, isFetching } = useEmployees({
    status: 'ACTIVE',
    pageSize: 10,
    ...(debouncedSearch.length >= 2 ? { search: debouncedSearch } : {}),
  });

  const options = (data?.data ?? []).filter((employee) => employee.id !== excludeEmployeeId);

  const choose = (employee: Employee): void => {
    onChange(employee);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            invalid && 'border-destructive',
          )}
        >
          {value ? `${value.fullName} · ${value.employeeCode}` : 'Select an employee'}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            className="h-10 border-0 px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
          {isFetching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : null}
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {search.length > 0 ? 'No active employee matches that.' : 'Start typing to search.'}
            </p>
          ) : (
            options.map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => choose(employee)}
                className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <Check
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    value?.id === employee.id ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{employee.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {employee.employeeCode} · {employee.department}
                    {employee.openAssignmentCount ? ` · holds ${employee.openAssignmentCount}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
