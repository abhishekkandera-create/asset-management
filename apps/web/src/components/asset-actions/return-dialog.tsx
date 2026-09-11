import * as React from 'react';
import type { Asset, ConditionGrade } from '@asset/shared';
import { useReturnAsset } from '@/hooks/use-assets';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActionDialog, FieldError } from './action-dialog';
import { ConditionSelect } from './condition-select';

export function ReturnDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const returnAsset = useReturnAsset(asset.id);
  const toast = useToast();

  const [conditionIn, setConditionIn] = React.useState<ConditionGrade | ''>('');
  const [remarks, setRemarks] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched(true);
    if (!conditionIn) return;

    returnAsset.mutate(
      { conditionIn, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) },
      {
        onSuccess: () => {
          toast.success(`${asset.assetTag} returned`, 'It is now awaiting inspection.');
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Return ${asset.assetTag}`}
      description={`Currently held by ${asset.currentHolder?.fullName ?? 'nobody'}`}
      submitLabel="Record return"
      isSubmitting={returnAsset.isPending}
      error={returnAsset.error}
      onSubmit={handleSubmit}
      consequence={
        <>
          The assignment to <strong>{asset.currentHolder?.fullName}</strong> closes and the asset
          moves to <strong>Awaiting inspection</strong> — not straight back into stock. It cannot be
          issued again until someone inspects it.
        </>
      }
    >
      <ConditionSelect
        id="condition-in"
        label="Condition on return"
        value={conditionIn}
        onChange={setConditionIn}
        hint="Record what you actually see, not what was issued."
      />
      <FieldError message={touched && !conditionIn ? 'Choose a condition' : undefined} />

      <div className="space-y-2">
        <Label htmlFor="return-remarks">Remarks (optional)</Label>
        <Textarea
          id="return-remarks"
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Damage, missing accessories, anything unusual"
        />
      </div>
    </ActionDialog>
  );
}
