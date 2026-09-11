import type { AssetStatus } from '@asset/shared';
import { cn } from '@/lib/utils';

/**
 * One label and colour per status, defined once so a status never looks
 * different on two screens.
 */
const STATUS_META: Record<AssetStatus, { label: string; className: string }> = {
  IN_STOCK: {
    label: 'In stock',
    className: 'bg-status-stock/15 text-status-stock border-status-stock/30',
  },
  ASSIGNED: {
    label: 'Assigned',
    className: 'bg-status-assigned/15 text-status-assigned border-status-assigned/30',
  },
  RETURNED_PENDING_CHECK: {
    label: 'Awaiting inspection',
    className: 'bg-status-pending/15 text-status-pending border-status-pending/30',
  },
  IN_REPAIR: {
    label: 'In repair',
    className: 'bg-status-repair/15 text-status-repair border-status-repair/30',
  },
  RETIRED: {
    label: 'Retired',
    className: 'bg-status-retired/15 text-status-retired border-status-retired/30',
  },
  LOST: { label: 'Lost', className: 'bg-status-lost/15 text-status-lost border-status-lost/30' },
};

export function statusLabel(status: AssetStatus): string {
  return STATUS_META[status].label;
}

export function StatusBadge({
  status,
  className,
}: {
  status: AssetStatus;
  className?: string;
}): JSX.Element {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
