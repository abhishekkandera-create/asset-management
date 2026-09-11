import * as React from 'react';
import {
  ArrowRightLeft,
  CircleAlert,
  ClipboardCheck,
  FileText,
  PackageMinus,
  PackagePlus,
  Receipt,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AssetEvent, AssetEventType } from '@asset/shared';
import { formatDateTime } from '@/lib/utils';
import { StatusBadge } from '@/components/status-badge';

const EVENT_META: Record<
  AssetEventType,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  PURCHASED: {
    label: 'Purchased',
    icon: Receipt,
    tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  STOCK_IN: {
    label: 'Received into stock',
    icon: PackagePlus,
    tone: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  ISSUED: {
    label: 'Issued',
    icon: UserPlus,
    tone: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  RETURNED: {
    label: 'Returned',
    icon: UserMinus,
    tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  INSPECTED: {
    label: 'Inspected',
    icon: ClipboardCheck,
    tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  SENT_FOR_REPAIR: {
    label: 'Sent for repair',
    icon: Wrench,
    tone: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  REPAIR_COMPLETED: {
    label: 'Repair completed',
    icon: Wrench,
    tone: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  TRANSFERRED: {
    label: 'Transferred',
    icon: ArrowRightLeft,
    tone: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  MARKED_LOST: {
    label: 'Reported lost',
    icon: CircleAlert,
    tone: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  WRITTEN_OFF: {
    label: 'Assignment written off',
    icon: ShieldOff,
    tone: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  RETIRED: {
    label: 'Retired',
    icon: Trash2,
    tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  },
  NOTE_ADDED: {
    label: 'Note added',
    icon: FileText,
    tone: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  },
};

/**
 * The asset history, as a vertical timeline (CLAUDE.md §9 screen 4). Events
 * arrive newest first and are rendered in that order — the most recent thing
 * that happened is what someone opening this page is usually looking for.
 */
export function EventTimeline({ events }: { events: AssetEvent[] }): JSX.Element {
  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => {
        const meta = EVENT_META[event.eventType] ?? {
          label: event.eventType,
          icon: PackageMinus,
          tone: 'bg-muted text-muted-foreground',
        };
        const Icon = meta.icon;
        const isLast = index === events.length - 1;

        return (
          <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
            {!isLast ? (
              <span
                className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-px bg-border"
                aria-hidden
              />
            ) : null}

            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-medium">{meta.label}</span>
                {event.fromStatus && event.toStatus ? (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <StatusBadge status={event.fromStatus} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={event.toStatus} />
                  </span>
                ) : null}
                <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(event.occurredAt)}
                </span>
              </div>

              {event.employee ? (
                <p className="mt-1 text-sm">
                  <Link
                    to={`/employees/${event.employee.id}`}
                    className="font-medium text-primary hover:underline"
                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                  >
                    {event.employee.fullName}
                  </Link>
                  <span className="text-muted-foreground"> · {event.employee.employeeCode}</span>
                </p>
              ) : null}

              {event.notes ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {event.notes}
                </p>
              ) : null}

              <p className="mt-1 text-xs text-muted-foreground">
                by {event.actor?.fullName ?? 'unknown'}
                {event.location ? ` · ${event.location.name}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
