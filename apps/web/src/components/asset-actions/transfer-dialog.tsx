import * as React from 'react';
import type { Asset, ConditionGrade, Employee } from '@asset/shared';
import { useTransferAsset } from '@/hooks/use-assets';
import { useToast } from '@/hooks/use-toast';
import { EmployeePicker } from '@/components/employee-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActionDialog, FieldError } from './action-dialog';
import { ConditionSelect } from './condition-select';

/**
 * One endpoint, three steps, one transaction (CLAUDE.md §7.9). The dialog
 * says so explicitly, because "transfer" could otherwise look like it skips
 * the inspection gate.
 */
export function TransferDialog({
  asset,
  open,
  onOpenChange,
}: {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const transfer = useTransferAsset(asset.id);
  const toast = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [conditionIn, setConditionIn] = React.useState<ConditionGrade | ''>('');
  const [conditionOut, setConditionOut] = React.useState<ConditionGrade | ''>('');
  const [remarks, setRemarks] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched(true);
    if (!employee || !conditionIn || !conditionOut) return;

    transfer.mutate(
      {
        toEmployeeId: employee.id,
        conditionIn,
        conditionOut,
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${asset.assetTag} transferred`, `Now held by ${employee.fullName}`);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Transfer ${asset.assetTag}`}
      description={`From ${asset.currentHolder?.fullName ?? 'nobody'} directly to someone else`}
      submitLabel="Transfer asset"
      isSubmitting={transfer.isPending}
      error={transfer.error}
      onSubmit={handleSubmit}
      consequence={
        <>
          This runs three steps in one transaction: the assignment to{' '}
          <strong>{asset.currentHolder?.fullName}</strong> closes, the asset is inspected, and a new
          assignment opens for <strong>{employee?.fullName ?? 'the recipient'}</strong>. Three
          events are written; if any step fails, none of them happen.
        </>
      }
    >
      <div className="space-y-2">
        <Label>Transfer to</Label>
        <EmployeePicker
          value={employee}
          onChange={setEmployee}
          excludeEmployeeId={asset.currentHolder?.employeeId}
          invalid={touched && !employee}
        />
        <FieldError message={touched && !employee ? 'Choose a recipient' : undefined} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <ConditionSelect
            id="transfer-condition-in"
            label="Condition handed back"
            value={conditionIn}
            onChange={setConditionIn}
          />
          <FieldError message={touched && !conditionIn ? 'Required' : undefined} />
        </div>
        <div>
          <ConditionSelect
            id="transfer-condition-out"
            label="Condition handed on"
            value={conditionOut}
            onChange={setConditionOut}
          />
          <FieldError message={touched && !conditionOut ? 'Required' : undefined} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transfer-remarks">Remarks (optional)</Label>
        <Textarea
          id="transfer-remarks"
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Why the asset is changing hands"
        />
      </div>
    </ActionDialog>
  );
}
