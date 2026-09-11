import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRightLeft,
  CircleAlert,
  ClipboardCheck,
  FileText,
  History,
  PackageOpen,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { allowedTransitions, type Asset, type AssetStatus } from '@asset/shared';
import { useAsset, useAssetHistory } from '@/hooks/use-assets';
import { useAuth } from '@/hooks/use-auth';
import { formatDate, formatDateTime } from '@/lib/utils';
import { messageOf } from '@/lib/api-error';
import { StatusBadge } from '@/components/status-badge';
import { ConditionBadge } from '@/components/condition-badge';
import { EventTimeline } from '@/components/event-timeline';
import { EmptyState } from '@/components/empty-state';
import { IssueDialog } from '@/components/asset-actions/issue-dialog';
import { ReturnDialog } from '@/components/asset-actions/return-dialog';
import { InspectDialog } from '@/components/asset-actions/inspect-dialog';
import { TransferDialog } from '@/components/asset-actions/transfer-dialog';
import {
  AddNoteDialog,
  MarkLostDialog,
  RecoverDialog,
  RetireDialog,
} from '@/components/asset-actions/simple-dialogs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type DialogName =
  'issue' | 'return' | 'inspect' | 'transfer' | 'lost' | 'recover' | 'retire' | 'note';

export function AssetDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data: asset, isLoading, isError, error } = useAsset(id);
  const history = useAssetHistory(id);
  const [dialog, setDialog] = React.useState<DialogName | null>(null);
  const close = (open: boolean): void => {
    if (!open) setDialog(null);
  };

  if (isLoading) return <AssetDetailSkeleton />;

  if (isError || !asset) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>Could not load this asset</AlertTitle>
          <AlertDescription>{messageOf(error)}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/assets">Back to assets</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/assets">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to assets
        </Link>
      </Button>

      <AssetHeader asset={asset} onAction={setDialog} />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">
            History
            {history.data ? (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({history.data.meta.total})
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="repairs">Repairs</TabsTrigger>
          <TabsTrigger value="purchase">Purchase</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <AssetOverview asset={asset} />
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full history</CardTitle>
            </CardHeader>
            <CardContent>
              {history.isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-16 w-full" />
                  ))}
                </div>
              ) : history.data && history.data.data.length > 0 ? (
                <EventTimeline events={history.data.data} />
              ) : (
                <EmptyState
                  icon={History}
                  title="No events yet"
                  description="Every issue, return, repair and transfer will appear here."
                  className="border-0"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="repairs">
          <EmptyState
            icon={ClipboardCheck}
            title="Repair tickets arrive in a later phase"
            description="Once repairs are built, this tab lists every ticket raised against this asset, with cost and outcome."
          />
        </TabsContent>

        <TabsContent value="purchase">
          {asset.purchaseItemId ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Purchase details arrive with the procurement phase.
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={FileText}
              title="No purchase record linked"
              description="This asset predates the system, or was added manually. Its warranty date was entered directly."
            />
          )}
        </TabsContent>
      </Tabs>

      {/*
        Each dialog is mounted only while it is the active one, so every open
        starts from fresh state. Resetting a long-lived form in an effect would
        do the same job with an extra render and a subtle ordering bug.
      */}
      {dialog === 'issue' ? <IssueDialog asset={asset} open onOpenChange={close} /> : null}
      {dialog === 'return' ? <ReturnDialog asset={asset} open onOpenChange={close} /> : null}
      {dialog === 'inspect' ? <InspectDialog asset={asset} open onOpenChange={close} /> : null}
      {dialog === 'transfer' ? <TransferDialog asset={asset} open onOpenChange={close} /> : null}
      {dialog === 'lost' ? <MarkLostDialog asset={asset} open onOpenChange={close} /> : null}
      {dialog === 'recover' ? <RecoverDialog asset={asset} open onOpenChange={close} /> : null}
      {dialog === 'retire' ? <RetireDialog asset={asset} open onOpenChange={close} /> : null}
      {dialog === 'note' ? <AddNoteDialog asset={asset} open onOpenChange={close} /> : null}
    </div>
  );
}

interface ActionSpec {
  name: DialogName;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** The asset statuses from which this action makes sense. */
  from: AssetStatus[];
  requiresRole: 'STORE_KEEPER' | 'ADMIN';
  variant?: 'default' | 'outline' | 'destructive';
  /** Shown in a tooltip when the action is unavailable. */
  blockedReason: (asset: Asset) => string;
}

const ACTIONS: ActionSpec[] = [
  {
    name: 'issue',
    label: 'Issue',
    icon: UserPlus,
    from: ['IN_STOCK'],
    requiresRole: 'STORE_KEEPER',
    blockedReason: (asset) =>
      asset.status === 'ASSIGNED'
        ? `Already held by ${asset.currentHolder?.fullName ?? 'someone'}`
        : asset.status === 'RETURNED_PENDING_CHECK'
          ? 'Must be inspected before it can be issued again'
          : `Cannot issue an asset that is ${asset.status.replace(/_/g, ' ').toLowerCase()}`,
  },
  {
    name: 'return',
    label: 'Return',
    icon: UserMinus,
    from: ['ASSIGNED'],
    requiresRole: 'STORE_KEEPER',
    variant: 'outline',
    blockedReason: () => 'Nobody is holding this asset',
  },
  {
    name: 'inspect',
    label: 'Inspect',
    icon: ClipboardCheck,
    from: ['RETURNED_PENDING_CHECK'],
    requiresRole: 'STORE_KEEPER',
    blockedReason: () => 'Only an asset awaiting inspection can be inspected',
  },
  {
    name: 'transfer',
    label: 'Transfer',
    icon: ArrowRightLeft,
    from: ['ASSIGNED'],
    requiresRole: 'STORE_KEEPER',
    variant: 'outline',
    blockedReason: () => 'Only an asset someone currently holds can be transferred',
  },
  {
    name: 'recover',
    label: 'Recover',
    icon: PackageOpen,
    from: ['LOST'],
    requiresRole: 'STORE_KEEPER',
    variant: 'outline',
    blockedReason: () => 'Only a lost asset can be recovered',
  },
  {
    name: 'lost',
    label: 'Report lost',
    icon: CircleAlert,
    from: ['IN_STOCK', 'ASSIGNED'],
    requiresRole: 'STORE_KEEPER',
    variant: 'outline',
    blockedReason: (asset) =>
      `Cannot report an asset that is ${asset.status.replace(/_/g, ' ').toLowerCase()} as lost`,
  },
  {
    name: 'retire',
    label: 'Retire',
    icon: Trash2,
    from: ['IN_STOCK', 'RETURNED_PENDING_CHECK', 'IN_REPAIR'],
    requiresRole: 'ADMIN',
    variant: 'destructive',
    blockedReason: (asset) =>
      asset.status === 'RETIRED' ? 'Already retired' : 'Return the asset before retiring it',
  },
];

function AssetHeader({
  asset,
  onAction,
}: {
  asset: Asset;
  onAction: (dialog: DialogName) => void;
}): JSX.Element {
  const { can } = useAuth();
  // The same allow-list the API enforces decides what the UI offers (§9.4).
  const reachable = allowedTransitions(asset.status);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{asset.assetTag}</h1>
            <StatusBadge status={asset.status} />
            <ConditionBadge grade={asset.conditionGrade} />
          </div>
          <p className="text-muted-foreground">
            {asset.model?.manufacturer} {asset.model?.modelName}
            {asset.model?.category ? ` · ${asset.model.category.name}` : ''}
            {asset.serialNumber ? ` · ${asset.serialNumber}` : ''}
          </p>

          {asset.currentHolder ? (
            <p className="text-sm">
              Held by{' '}
              <Link
                to={`/employees/${asset.currentHolder.employeeId}`}
                className="font-medium text-primary hover:underline"
              >
                {asset.currentHolder.fullName}
              </Link>{' '}
              <span className="text-muted-foreground">
                since {formatDate(asset.currentHolder.issuedOn)}
                {asset.status === 'IN_REPAIR' ? ' · currently away for repair' : ''}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not currently issued to anyone</p>
          )}
        </div>

        <TooltipProvider delayDuration={200}>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((action) => {
              const allowedByStatus = action.from.includes(asset.status);
              const allowedByRole = can(action.requiresRole);
              const enabled = allowedByStatus && allowedByRole;
              const reason = !allowedByRole
                ? `Requires the ${action.requiresRole.replace('_', ' ').toLowerCase()} role`
                : action.blockedReason(asset);

              const Icon = action.icon;
              const button = (
                <Button
                  variant={action.variant ?? 'default'}
                  size="sm"
                  disabled={!enabled}
                  onClick={() => onAction(action.name)}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {action.label}
                </Button>
              );

              if (enabled) return <React.Fragment key={action.name}>{button}</React.Fragment>;

              return (
                <Tooltip key={action.name}>
                  {/* A disabled button fires no events, so the trigger wraps it. */}
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>{button}</span>
                  </TooltipTrigger>
                  <TooltipContent>{reason}</TooltipContent>
                </Tooltip>
              );
            })}

            {can('STORE_KEEPER') ? (
              <Button variant="ghost" size="sm" onClick={() => onAction('note')}>
                <FileText className="h-4 w-4" aria-hidden />
                Add note
              </Button>
            ) : null}
          </div>
        </TooltipProvider>
      </CardContent>

      {reachable.length === 0 ? (
        <CardContent className="border-t pt-4">
          <p className="text-sm text-muted-foreground">
            This asset is retired. Its record and history stay in the system permanently, but it can
            never move to another status.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}

function AssetOverview({ asset }: { asset: Asset }): JSX.Element {
  const warrantyExpired =
    asset.warrantyExpiresOn && new Date(`${asset.warrantyExpiresOn}T00:00:00Z`) < new Date();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Asset</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-4 gap-y-3 text-sm">
            <Field label="Asset tag" value={asset.assetTag} hint="Immutable once created" />
            <Field label="Serial number" value={asset.serialNumber ?? '—'} />
            <Field label="Category" value={asset.model?.category?.name ?? '—'} />
            <Field label="Manufacturer" value={asset.model?.manufacturer ?? '—'} />
            <Field label="Model" value={asset.model?.modelName ?? '—'} />
            <Field
              label="Owning location"
              value={`${asset.location?.name ?? '—'}${asset.location?.city ? ` · ${asset.location.city}` : ''}`}
              hint="Where the asset belongs, not where its holder sits"
            />
            <Field
              label="Warranty"
              value={
                asset.warrantyExpiresOn
                  ? `${formatDate(asset.warrantyExpiresOn)}${warrantyExpired ? ' (expired)' : ''}`
                  : 'Not recorded'
              }
            />
            <Field label="Added" value={formatDateTime(asset.createdAt)} />
          </dl>

          {asset.notes ? (
            <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="mb-1 font-medium">Notes</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{asset.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Specifications</CardTitle>
        </CardHeader>
        <CardContent>
          {asset.model?.specs && Object.keys(asset.model.specs).length > 0 ? (
            <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-4 gap-y-3 text-sm">
              {Object.entries(asset.model.specs).map(([key, value]) => (
                <Field key={key} label={humaniseKey(key)} value={String(value)} />
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              No specifications recorded for this model.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): JSX.Element {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        {value}
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </dd>
    </>
  );
}

/** `screenInches` -> `Screen inches`, for the free-form specs blob. */
function humaniseKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function AssetDetailSkeleton(): JSX.Element {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-10 w-80" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
