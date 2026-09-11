import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { PaginationMeta } from '@asset/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  meta?: PaginationMeta | undefined;
  isLoading?: boolean;
  /** Server-side sorting: the table reports intent, the query does the work. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: TData) => void;
  emptyState?: React.ReactNode;
  /** Rendered above the table, to the right of any filters. */
  toolbar?: React.ReactNode;
}

export function DataTable<TData>({
  columns,
  data,
  meta,
  isLoading = false,
  sorting = [],
  onSortingChange,
  onPageChange,
  onRowClick,
  emptyState,
  toolbar,
}: DataTableProps<TData>): JSX.Element {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { sorting },
    ...(onSortingChange ? { onSortingChange } : {}),
  });

  const showEmpty = !isLoading && data.length === 0;

  return (
    <div className="space-y-3">
      {toolbar}

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();

                  return (
                    <TableHead key={header.id} style={{ width: header.getSize() || undefined }}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3 w-3" aria-hidden />
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-transparent">
                    {columns.map((_column, columnIndex) => (
                      <TableCell key={columnIndex}>
                        <Skeleton className="h-4 w-full max-w-[160px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(onRowClick && 'cursor-pointer')}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {showEmpty ? <div className="p-2">{emptyState}</div> : null}
      </div>

      {meta && meta.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            Showing {(meta.page - 1) * meta.pageSize + 1}–
            {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1 || isLoading}
              onClick={() => onPageChange?.(meta.page - 1)}
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {meta.page} of {Math.max(1, meta.totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages || isLoading}
              onClick={() => onPageChange?.(meta.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
