import * as React from 'react';
import type { Asset, ConditionGrade, InspectionOutcome } from '@asset/shared';
import { useInspectAsset } from '@/hooks/use-assets';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ActionDialog, FieldError } from './action-dialog';
import { ConditionSelect } from './condition-select';

const OUTCOMES: Array<{ value: InspectionOutcome; label: string; consequence: string }> = [
  {
    value: 'TO_STOCK',
    label: 'Passed — return to stock',
    consequence: 'The asset becomes available to issue again.',
  },
  {
    value: 'TO_REPAIR',
    label: 'Failed — send for repair',
    consequence: 'The asset moves to In repair and cannot be issued until the repair closes.',
  },
  {
    value: 'RETIRE',
    label: 'Beyond economical repair — retire',
    consequence: 'The asset is retired. This is terminal: nothing comes back from Retired.',
  },
];

export function InspectDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const inspect = useInspectAsset(asset.id);
  const toast = useToast();

  const [outcome, setOutcome] = React.useState<InspectionOutcome | ''>('');
  const [conditionGrade, setConditionGrade] = React.useState<ConditionGrade | ''>(
    asset.conditionGrade,
  );
  const [notes, setNotes] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const selected = OUTCOMES.find((option) => option.value === outcome);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched(true);
    if (!outcome || !conditionGrade) return;

    inspect.mutate(
      { outcome, conditionGrade, ...(notes.trim() ? { notes: notes.trim() } : {}) },
      {
        onSuccess: (updated) => {
          toast.success(
            `${asset.assetTag} inspected`,
            `Now ${updated.status.replace(/_/g, ' ').toLowerCase()}`,
          );
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Inspect ${asset.assetTag}`}
      description="Decide what happens to this asset now it is back."
      submitLabel="Record inspection"
      destructive={outcome === 'RETIRE'}
      isSubmitting={inspect.isPending}
      error={inspect.error}
      onSubmit={handleSubmit}
      consequence={selected?.consequence ?? 'Choose an outcome to see what will happen.'}
    >
      <div className="space-y-2">
        <Label htmlFor="inspection-outcome">Outcome</Label>
        <Select value={outcome} onValueChange={(next) => setOutcome(next as InspectionOutcome)}>
          <SelectTrigger id="inspection-outcome" aria-invalid={touched && !outcome}>
            <SelectValue placeholder="Select an outcome" />
          </SelectTrigger>
          <SelectContent>
            {OUTCOMES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError message={touched && !outcome ? 'Choose an outcome' : undefined} />
      </div>

      <ConditionSelect
        id="inspection-condition"
        label="Condition after inspection"
        value={conditionGrade}
        onChange={setConditionGrade}
      />

      <div className="space-y-2">
        <Label htmlFor="inspection-notes">Notes (optional)</Label>
        <Textarea
          id="inspection-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What you found, what was done"
        />
      </div>
    </ActionDialog>
  );
}
