import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AssetCategory, AssetModel, Location, Paginated, Vendor } from '@asset/shared';
import { api } from '@/lib/api-client';

export const masterKeys = {
  locations: () => ['masters', 'locations'] as const,
  vendors: () => ['masters', 'vendors'] as const,
  categories: () => ['masters', 'categories'] as const,
  models: (categoryId?: string) => ['masters', 'models', categoryId ?? 'all'] as const,
};

/** Reference data barely changes, so it is cached for the session. */
const REFERENCE_DATA = { staleTime: 10 * 60_000, gcTime: 30 * 60_000 };

export function useLocations(): UseQueryResult<Paginated<Location>> {
  return useQuery({
    queryKey: masterKeys.locations(),
    queryFn: ({ signal }) => api.get<Paginated<Location>>('/locations', { pageSize: 100 }, signal),
    ...REFERENCE_DATA,
  });
}

export function useVendors(): UseQueryResult<Paginated<Vendor>> {
  return useQuery({
    queryKey: masterKeys.vendors(),
    queryFn: ({ signal }) => api.get<Paginated<Vendor>>('/vendors', { pageSize: 100 }, signal),
    ...REFERENCE_DATA,
  });
}

export function useCategories(): UseQueryResult<Paginated<AssetCategory>> {
  return useQuery({
    queryKey: masterKeys.categories(),
    queryFn: ({ signal }) =>
      api.get<Paginated<AssetCategory>>('/categories', { pageSize: 100 }, signal),
    ...REFERENCE_DATA,
  });
}

export function useModels(categoryId?: string): UseQueryResult<Paginated<AssetModel>> {
  return useQuery({
    queryKey: masterKeys.models(categoryId),
    queryFn: ({ signal }) =>
      api.get<Paginated<AssetModel>>('/models', { pageSize: 100, categoryId }, signal),
    ...REFERENCE_DATA,
  });
}
