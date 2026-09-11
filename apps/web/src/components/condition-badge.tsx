import type { ConditionGrade } from '@asset/shared';
import { cn } from '@/lib/utils';

const CONDITION_META: Record<ConditionGrade, { label: string; className: string }> = {
  NEW: { label: 'New', className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  GOOD: { label: 'Good', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
  FAIR: { label: 'Fair', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  POOR: { label: 'Poor', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400' },
  DAMAGED: { label: 'Damaged', className: 'bg-red-500/10 text-red-700 dark:text-red-400' },
};

export function conditionLabel(grade: ConditionGrade): string {
  return CONDITION_META[grade].label;
}

export function ConditionBadge({
  grade,
  className,
}: {
  grade: ConditionGrade;
  className?: string;
}): JSX.Element {
  const meta = CONDITION_META[grade];
  return (
    <span
      className={cn(
        'inline-flex rounded px-2 py-0.5 text-xs font-medium',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
