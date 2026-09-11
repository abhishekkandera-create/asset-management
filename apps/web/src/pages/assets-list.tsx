import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { Download, PackageSearch, Plus, Search, X } from 'lucide-react';
import {
  ASSET_STATUSES,
  CONDITION_GRADES,
  type Asset,
  type AssetStatus,
  type ConditionGrade,
} from '@asset/shared';
import { useAssets } from '@/hooks/use-assets';
import { useCategories, useLocations, useModels } from '@/hooks/use-masters';
import { useDebounced } from '@/hooks/use-debounced';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/utils';
import { messageOf } from '@/lib/api-error';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { CreateAssetDialog } from '@/components/asset-actions/create-asset-dialog';
import { StatusBadge, statusLabel } from '@/components/status-badge';
import { ConditionBadge, conditionLabel } from '@/components/condition-badge';
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
const PAGE_SIZE = 25;

export function AssetsListPage(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const [isCreating, setIsCreating] = React.useState(false);

  // Filters live in the URL, so a filtered view is a shareable link and the
  // back button behaves.
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = React.useState(params.get('search') ?? '');
  const debouncedSearch = useDebounced(searchInput, 300);
  const [isExporting, setIsExporting] = React.useState(false);

  const page = Number(params.get('page') ?? '1');
  const status = params.get('status') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const modelId = params.get('modelId') ?? '';
  const locationId = params.get('locationId') ?? '';
  const conditionGrade = params.get('conditionGrade') ?? '';
  const sortBy = params.get('sortBy') ?? 'assetTag';
  const sortOrder = (params.get('sortOrder') ?? 'asc') as 'asc' | 'desc';

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
      if (key === 'categoryId') next.delete('modelId');
      return next;
    });
  };

  const query = {
    page,
    pageSize: PAGE_SIZE,
    sortBy: sortBy as 'assetTag',
    sortOrder,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status ? { status: status as AssetStatus } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(conditionGrade ? { conditionGrade: conditionGrade as ConditionGrade } : {}),
  };

  const { data, isLoading, isError, error } = useAssets(query);
  const categories = useCategories();
  const models = useModels(categoryId || undefined);
  const locations = useLocations();

  const hasFilters = Boolean(
    status || categoryId || modelId || locationId || conditionGrade || debouncedSearch,
  );

  const sorting: SortingState = [{ id: sortBy, desc: sortOrder === 'desc' }];

  const columns = React.useMemo<ColumnDef<Asset, unknown>[]>(
    () => [
      {
        accessorKey: 'assetTag',
        header: 'Tag',
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <span className="font-medium">{row.original.assetTag}</span>
            {row.original.serialNumber ? (
              <span className="block text-xs text-muted-foreground">
                {row.original.serialNumber}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'model',
        header: 'Model',
        cell: ({ row }) => (
          <div>
            <span>
              {row.original.model?.manufacturer} {row.original.model?.modelName}
            </span>
            <span className="block text-xs text-muted-foreground">
              {row.original.model?.category?.name}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'holder',
        header: 'Current holder',
        cell: ({ row }) => {
          const holder = row.original.currentHolder;
          if (!holder) return <span className="text-muted-foreground">—</span>;
          return (
            <div>
              <span>{holder.fullName}</span>
              <span className="block text-xs text-muted-foreground">
                {holder.employeeCode} · since {formatDate(holder.issuedOn)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'conditionGrade',
        header: 'Condition',
        cell: ({ row }) => <ConditionBadge grade={row.original.conditionGrade} />,
      },
      {
        id: 'location',
        header: 'Location',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.location?.name}
            <span className="block text-xs text-muted-foreground">
              {row.original.location?.city}
            </span>
          </span>
        ),
      },
      {
        accessorKey: 'warrantyExpiresOn',
        header: 'Warranty',
        enableSorting: true,
        cell: ({ row }) => {
          const value = row.original.warrantyExpiresOn;
          if (!value) return <span className="text-muted-foreground">—</span>;
          const expired = new Date(`${value}T00:00:00Z`) < new Date();
          return (
            <span className={expired ? 'text-muted-foreground line-through' : undefined}>
              {formatDate(value)}
            </span>
          );
        },
      },
    ],
    [],
  );

  const handleExport = async (): Promise<void> => {
    setIsExporting(true);
    try {
      // Export follows the filters on screen, capped at 1000 rows per page of
      // the API's own limit.
      const all: Asset[] = [];
      let currentPage = 1;
      let totalPages = 1;
      do {
        const response = await api.get<{ data: Asset[]; meta: { totalPages: number } }>('/assets', {
          ...query,
          page: currentPage,
          pageSize: 100,
        } as never);
        all.push(...response.data);
        totalPages = response.meta.totalPages;
        currentPage += 1;
      } while (currentPage <= totalPages && currentPage <= 40);

      const csv = toCsv(
        [
          'Asset tag',
          'Serial number',
          'Category',
          'Manufacturer',
          'Model',
          'Status',
          'Condition',
          'Current holder',
          'Employee code',
          'Department',
          'Issued on',
          'Location',
          'City',
          'Warranty expires',
        ],
        all.map((asset) => [
          asset.assetTag,
          asset.serialNumber ?? '',
          asset.model?.category?.name ?? '',
          asset.model?.manufacturer ?? '',
          asset.model?.modelName ?? '',
          statusLabel(asset.status),
          conditionLabel(asset.conditionGrade),
          asset.currentHolder?.fullName ?? '',
          asset.currentHolder?.employeeCode ?? '',
          asset.currentHolder?.department ?? '',
          asset.currentHolder?.issuedOn ?? '',
          asset.location?.name ?? '',
          asset.location?.city ?? '',
          asset.warrantyExpiresOn ?? '',
        ]),
      );

      downloadCsv(`assets-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.success(`Exported ${all.length} assets`);
    } catch (exportError) {
      toast.error('Export failed', messageOf(exportError));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">
            Every individually tracked unit. The holder shown is always read from the open
            assignment.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} loading={isExporting}>
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          {can('ADMIN') ? (
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add asset
            </Button>
          ) : null}
        </div>
      </header>

      {isCreating ? (
        <CreateAssetDialog
          open
          onOpenChange={setIsCreating}
          onCreated={(asset) => navigate(`/assets/${asset.id}`)}
        />
      ) : null}

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
        sorting={sorting}
        onSortingChange={(updater) => {
          const next = typeof updater === 'function' ? updater(sorting) : updater;
          const first = next[0];
          if (!first) return;
          setParams((previous) => {
            const params2 = new URLSearchParams(previous);
            params2.set('sortBy', first.id);
            params2.set('sortOrder', first.desc ? 'desc' : 'asc');
            params2.delete('page');
            return params2;
          });
        }}
        onPageChange={(nextPage) => setParam('page', String(nextPage))}
        onRowClick={(asset) => navigate(`/assets/${asset.id}`)}
        emptyState={
          <EmptyState
            icon={PackageSearch}
            title={hasFilters ? 'No assets match these filters' : 'No assets yet'}
            description={
              hasFilters
                ? 'Try widening the search or clearing a filter.'
                : 'Assets appear here once they are received into stock.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchInput('');
                    setParams(new URLSearchParams());
                  }}
                >
                  Clear filters
                </Button>
              ) : can('ADMIN') ? (
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add the first asset
                </Button>
              ) : null
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
                placeholder="Search tag, serial or model"
                className="pl-9"
                aria-label="Search assets"
              />
            </div>

            <FilterSelect
              label="Status"
              value={status}
              onChange={(value) => setParam('status', value)}
              options={ASSET_STATUSES.map((value) => ({ value, label: statusLabel(value) }))}
            />
            <FilterSelect
              label="Category"
              value={categoryId}
              onChange={(value) => setParam('categoryId', value)}
              options={(categories.data?.data ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
            <FilterSelect
              label="Model"
              value={modelId}
              onChange={(value) => setParam('modelId', value)}
              options={(models.data?.data ?? []).map((model) => ({
                value: model.id,
                label: `${model.manufacturer} ${model.modelName}`,
              }))}
            />
            <FilterSelect
              label="Location"
              value={locationId}
              onChange={(value) => setParam('locationId', value)}
              options={(locations.data?.data ?? []).map((location) => ({
                value: location.id,
                label: location.name,
              }))}
            />
            <FilterSelect
              label="Condition"
              value={conditionGrade}
              onChange={(value) => setParam('conditionGrade', value)}
              options={CONDITION_GRADES.map((value) => ({ value, label: conditionLabel(value) }))}
            />

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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  return (
    <Select value={value || ANY} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-auto min-w-[130px]" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>All {label.toLowerCase()}s</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
