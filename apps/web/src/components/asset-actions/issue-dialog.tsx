import * as React from 'react';
import type { Asset, ConditionGrade, Employee } from '@asset/shared';
import { useIssueAsset } from '@/hooks/use-assets';
import { useToast } from '@/hooks/use-toast';
import { EmployeePicker } from '@/components/employee-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActionDialog, FieldError } from './action-dialog';
import { ConditionSelect } from './condition-select';

interface IssueDialogProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IssueDialog({ asset, open, onOpenChange }: IssueDialogProps): JSX.Element {
  const issue = useIssueAsset(asset.id);
  const toast = useToast();

  const [employee, setEmployee] = React.useState<Employee | null>(null);
  const [conditionOut, setConditionOut] = React.useState<ConditionGrade | ''>(asset.conditionGrade);
  const [expectedReturnOn, setExpectedReturnOn] = React.useState('');
  const [remarks, setRemarks] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched(true);
    if (!employee || !conditionOut) return;

    issue.mutate(
      {
        employeeId: employee.id,
        conditionOut,
        ...(expectedReturnOn ? { expectedReturnOn } : {}),
        ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${asset.assetTag} issued`, `Now held by ${employee.fullName}`);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Issue ${asset.assetTag}`}
      description={`${asset.model?.manufacturer} ${asset.model?.modelName}`}
      submitLabel="Issue asset"
      isSubmitting={issue.isPending}
      error={issue.error}
      onSubmit={handleSubmit}
      consequence={
        employee ? (
          <>
            <strong>{employee.fullName}</strong> becomes the current holder of{' '}
            <strong>{asset.assetTag}</strong>. The asset moves to <strong>Assigned</strong> and an
            ISSUED event is added to its history.
          </>
        ) : (
          'Choose who is receiving this asset.'
        )
      }
    >
      <div className="space-y-2">
        <Label>Issue to</Label>
        <EmployeePicker value={employee} onChange={setEmployee} invalid={touched && !employee} />
        <FieldError message={touched && !employee ? 'Choose an employee' : undefined} />
      </div>

      <ConditionSelect
        id="condition-out"
        label="Condition at issue"
        value={conditionOut}
        onChange={setConditionOut}
        hint="Recorded on the assignment, so the condition it comes back in can be compared."
      />
      <FieldError message={touched && !conditionOut ? 'Choose a condition' : undefined} />

      <div className="space-y-2">
        <Label htmlFor="expected-return">Expected back on (optional)</Label>
        <Input
          id="expected-return"
          type="date"
          value={expectedReturnOn}
          onChange={(event) => setExpectedReturnOn(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">Set this only for a temporary loan.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="issue-remarks">Remarks (optional)</Label>
        <Textarea
          id="issue-remarks"
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          placeholder="Anything worth recording about this handover"
        />
      </div>
    </ActionDialog>
  );
}
