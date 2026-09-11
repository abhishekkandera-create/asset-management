import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AddAssetNote,
  Asset,
  AssetEvent,
  CreateAsset,
  InspectAsset,
  IssueAsset,
  ListAssetsQuery,
  MarkLost,
  Paginated,
  RecoverAsset,
  RelocateAsset,
  RetireAsset,
  ReturnAsset,
  TransferAsset,
} from '@asset/shared';
import { api } from '@/lib/api-client';
import { dashboardKeys } from './use-dashboard';

export const assetKeys = {
  all: ['assets'] as const,
  lists: () => [...assetKeys.all, 'list'] as const,
  list: (query: Partial<ListAssetsQuery>) => [...assetKeys.lists(), query] as const,
  details: () => [...assetKeys.all, 'detail'] as const,
  detail: (id: string) => [...assetKeys.details(), id] as const,
  history: (id: string, page: number) => [...assetKeys.detail(id), 'history', page] as const,
  assignments: (id: string) => [...assetKeys.detail(id), 'assignments'] as const,
};

export function useAssets(query: Partial<ListAssetsQuery>): UseQueryResult<Paginated<Asset>> {
  return useQuery({
    queryKey: assetKeys.list(query),
    queryFn: ({ signal }) => api.get<Paginated<Asset>>('/assets', query as never, signal),
    placeholderData: (previous) => previous,
  });
}

export function useAsset(id: string | undefined): UseQueryResult<Asset> {
  return useQuery({
    queryKey: assetKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<Asset>(`/assets/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useAssetHistory(
  id: string | undefined,
  page = 1,
): UseQueryResult<Paginated<AssetEvent>> {
  return useQuery({
    queryKey: assetKeys.history(id ?? '', page),
    queryFn: ({ signal }) =>
      api.get<Paginated<AssetEvent>>(`/assets/${id}/history`, { page, pageSize: 50 }, signal),
    enabled: Boolean(id),
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAsset) => api.post<Asset>('/assets', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    },
  });
}

/**
 * Every lifecycle action invalidates the same three things: the asset, its
 * history, and the lists and dashboard counts it appears in.
 */
function useAssetAction<TBody>(
  action: string,
  assetId: string,
): UseMutationResult<Asset, Error, TBody> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TBody) => api.post<Asset>(`/assets/${assetId}/${action}`, body),
    onSuccess: (asset) => {
      queryClient.setQueryData(assetKeys.detail(assetId), asset);
      void queryClient.invalidateQueries({ queryKey: assetKeys.detail(assetId) });
      void queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });
}

export const useIssueAsset = (id: string) => useAssetAction<IssueAsset>('issue', id);
export const useReturnAsset = (id: string) => useAssetAction<ReturnAsset>('return', id);
export const useInspectAsset = (id: string) => useAssetAction<InspectAsset>('inspect', id);
export const useTransferAsset = (id: string) => useAssetAction<TransferAsset>('transfer', id);
export const useMarkAssetLost = (id: string) => useAssetAction<MarkLost>('mark-lost', id);
export const useRecoverAsset = (id: string) => useAssetAction<RecoverAsset>('recover', id);
export const useRetireAsset = (id: string) => useAssetAction<RetireAsset>('retire', id);
export const useRelocateAsset = (id: string) => useAssetAction<RelocateAsset>('relocate', id);
export const useAddAssetNote = (id: string) => useAssetAction<AddAssetNote>('notes', id);
