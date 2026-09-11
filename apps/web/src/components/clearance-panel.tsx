import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ShieldOff, UserMinus } from 'lucide-react';
import type { Clearance, ClearanceItem } from '@asset/shared';
import { useExitEmployee, useWriteOffAssignment } from '@/hooks/use-employees';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/utils';
import { messageOf } from '@/lib/api-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActionDialog, FieldError } from '@/components/asset-actions/action-dialog';

/**
 * The exit-clearance checklist (CLAUDE.md §9 screen 7). Each outstanding item
 * is settled either by returning the asset — on the asset's own page, where
 * the condition can be recorded — or by writing the assignment off here.
 */
export function ClearancePanel({ clearance }: { clearance: Clearance }): JSX.Element {
  const { can } = useAuth();
  const [writeOffTarget, setWriteOffTarget] = React.useState<ClearanceItem | null>(null);
  const [exitOpen, setExitOpen] = React.useState(false);

  const alreadyExited = clearance.status === 'EXITED';

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Exit clearance</CardTitle>
          <CardDescription>
            {alreadyExited
              ? `Exited on ${formatDate(clearance.dateExited)}`
              : clearance.isClear
                ? 'Nothing outstanding — this employee can be marked as exited.'
                : `${clearance.openAssignments.length} item${clearance.openAssignments.length === 1 ? '' : 's'} must be returned or written off first.`}
          </CardDescription>
        </div>

        {!alreadyExited && can('ADMIN') ? (
          <Button
            size="sm"
            variant={clearance.isClear ? 'default' : 'outline'}
            disabled={!clearance.isClear}
            onClick={() => setExitOpen(true)}
            title={clearance.isClear ? undefined : 'Clear the outstanding items first'}
          >
            <UserMinus className="h-4 w-4" aria-hidden />
            Mark as exited
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3">
        {clearance.isClear ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-status-assigned" aria-hidden />
            <AlertTitle>Clear</AlertTitle>
            <AlertDescription>
              {alreadyExited
                ? 'This employee has exited. Their assignment history is preserved in full.'
                : 'This employee holds nothing.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertTitle>Exit is blocked</AlertTitle>
              <AlertDescription>
                Each item below must be returned or written off before this employee can be marked
                as exited.
              </AlertDescription>
            </Alert>

            <ul className="divide-y rounded-md border">
              {clearance.openAssignments.map((item) => (
                <li key={item.assignmentId} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/assets/${item.assetId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.assetTag}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {item.manufacturer} {item.modelName} · {item.categoryName}
                      {item.serialNumber ? ` · ${item.serialNumber}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Issued {formatDate(item.issuedOn)} · held {item.heldForDays} days
                      {item.expectedReturnOn
                        ? ` · due back ${formatDate(item.expectedReturnOn)}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/assets/${item.assetId}`}>Return</Link>
                    </Button>
                    {can('ADMIN') ? (
                      <Button size="sm" variant="ghost" onClick={() => setWriteOffTarget(item)}>
                        <ShieldOff className="h-4 w-4" aria-hidden />
                        Write off
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>

      {writeOffTarget ? (
        <WriteOffDialog
          employeeId={clearance.employeeId}
          employeeName={clearance.fullName}
          item={writeOffTarget}
          open
          onOpenChange={(open) => {
            if (!open) setWriteOffTarget(null);
          }}
        />
      ) : null}

      {exitOpen ? <ExitDialog clearance={clearance} open onOpenChange={setExitOpen} /> : null}
    </Card>
  );
}

function WriteOffDialog({
  employeeId,
  employeeName,
  item,
  open,
  onOpenChange,
}: {
  employeeId: string;
  employeeName: string;
  item: ClearanceItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const writeOff = useWriteOffAssignment(employeeId);
  const toast = useToast();
  const [reason, setReason] = React.useState('');
  const [markAssetLost, setMarkAssetLost] = React.useState(true);
  const [touched, setTouched] = React.useState(false);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Write off ${item.assetTag}`}
      description={`${employeeName} is leaving without returning this.`}
      submitLabel="Write off"
      destructive
      isSubmitting={writeOff.isPending}
      error={writeOff.error}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!reason.trim()) return;
        writeOff.mutate(
          { assignmentId: item.assignmentId, reason: reason.trim(), markAssetLost },
          {
            onSuccess: () => {
              toast.success(`${item.assetTag} written off`);
              onOpenChange(false);
            },
          },
        );
      }}
      consequence={
        <>
          The assignment closes without a physical return — no return date, no return condition.{' '}
          {markAssetLost
            ? 'The asset is also marked as lost.'
            : 'The asset keeps its current status, so it can still be collected later.'}{' '}
          <strong>{employeeName}</strong> stays on the asset&apos;s history as its former holder.
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="write-off-reason">Reason</Label>
        <Textarea
          id="write-off-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Not returned at exit; deducted from final settlement"
          aria-invalid={touched && !reason.trim()}
        />
        <FieldError message={touched && !reason.trim() ? 'A reason is required' : undefined} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={markAssetLost}
          onChange={(event) => setMarkAssetLost(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span>
          Also mark the asset as lost
          <span className="block text-xs text-muted-foreground">
            Leave this off if the hardware is still somewhere on site.
          </span>
        </span>
      </label>
    </ActionDialog>
  );
}

function ExitDialog({
  clearance,
  open,
  onOpenChange,
}: {
  clearance: Clearance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const exitEmployee = useExitEmployee(clearance.employeeId);
  const toast = useToast();
  const [dateExited, setDateExited] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [touched, setTouched] = React.useState(false);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Mark ${clearance.fullName} as exited`}
      description="This archives the employee; it does not delete anything."
      submitLabel="Mark as exited"
      isSubmitting={exitEmployee.isPending}
      error={exitEmployee.error}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!dateExited) return;
        exitEmployee.mutate(
          { dateExited },
          {
            onSuccess: () => {
              toast.success(`${clearance.fullName} marked as exited`);
              onOpenChange(false);
            },
          },
        );
      }}
      consequence={
        <>
          The employee record stays in the system with the status <strong>Exited</strong>. Every
          past assignment keeps pointing at it, so the question &ldquo;who had this laptop in
          2025?&rdquo; still has an answer. No asset can be issued to them afterwards.
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="date-exited">Last working day</Label>
        <Input
          id="date-exited"
          type="date"
          value={dateExited}
          onChange={(event) => setDateExited(event.target.value)}
          aria-invalid={touched && !dateExited}
        />
        <FieldError message={touched && !dateExited ? 'Pick a date' : undefined} />
        {exitEmployee.error ? (
          <p className="text-xs text-muted-foreground">{messageOf(exitEmployee.error)}</p>
        ) : null}
      </div>
    </ActionDialog>
  );
}
