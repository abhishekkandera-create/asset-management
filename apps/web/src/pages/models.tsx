import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Cpu, Pencil, Plus } from 'lucide-react';
import type { AssetModel } from '@asset/shared';
import { useCategories, useModels } from '@/hooks/use-masters';
import { useAuth } from '@/hooks/use-auth';
import { formatSpecs } from '@/lib/specs';
import { messageOf } from '@/lib/api-error';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ModelDialog } from '@/components/model-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ANY = '__any__';

/**
 * Models and their specifications. This is where specs are entered — they live
 * on the model, not on each unit, so one edit updates every asset of that model.
 */
export function ModelsPage(): JSX.Element {
  const { can } = useAuth();
  const [categoryId, setCategoryId] = React.useState('');
  const [editing, setEditing] = React.useState<AssetModel | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  const { data, isLoading, isError, error } = useModels(categoryId || undefined);
  const categories = useCategories();

  const columns = React.useMemo<ColumnDef<AssetModel, unknown>[]>(
    () => [
      {
        id: 'model',
        header: 'Model',
        cell: ({ row }) => (
          <div>
            <span className="font-medium">
              {row.original.manufacturer} {row.original.modelName}
            </span>
            <span className="block text-xs text-muted-foreground">
              {row.original.category?.name ?? '—'}
            </span>
          </div>
        ),
      },
      {
        id: 'specs',
        header: 'Specifications',
        cell: ({ row }) => {
          const specs = formatSpecs(row.original.specs);
          if (specs.length === 0) {
            return <span className="text-sm text-muted-foreground">None recorded</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {specs.map((spec) => (
                <span
                  key={spec.key}
                  className="rounded bg-muted px-1.5 py-0.5 text-xs"
                  title={`${spec.label}: ${spec.value}`}
                >
                  <span className="text-muted-foreground">{spec.label}</span> {spec.value}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: 'warranty',
        header: 'Warranty',
        cell: ({ row }) =>
          row.original.defaultWarrantyMonths != null ? (
            <span className="tabular-nums">{row.original.defaultWarrantyMonths} months</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Inactive
            </Badge>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          can('ADMIN') ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setEditing(row.original);
              }}
            >
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </Button>
          ) : null,
      },
    ],
    [can],
  );

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
          <p className="text-sm text-muted-foreground">
            The products you buy, and the specifications shown on every asset of each one.
          </p>
        </div>
        {can('ADMIN') ? (
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add model
          </Button>
        ) : null}
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
        emptyState={
          <EmptyState
            icon={Cpu}
            title="No models yet"
            description="Add the products you buy, so assets can be created against them."
            action={
              can('ADMIN') ? (
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add the first model
                </Button>
              ) : null
            }
            className="border-0"
          />
        }
        toolbar={
          <Select value={categoryId || ANY} onValueChange={(v) => setCategoryId(v === ANY ? '' : v)}>
            <SelectTrigger className="w-auto min-w-[180px]" aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All categories</SelectItem>
              {(categories.data?.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isCreating ? <ModelDialog open onOpenChange={setIsCreating} /> : null}
      {editing ? (
        <ModelDialog
          model={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
