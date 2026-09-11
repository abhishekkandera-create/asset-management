import * as React from 'react';
import type { Asset, ConditionGrade } from '@asset/shared';
import {
  useAddAssetNote,
  useMarkAssetLost,
  useRecoverAsset,
  useRetireAsset,
} from '@/hooks/use-assets';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ActionDialog, FieldError } from './action-dialog';
import { ConditionSelect } from './condition-select';

interface DialogProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarkLostDialog({ asset, open, onOpenChange }: DialogProps): JSX.Element {
  const markLost = useMarkAssetLost(asset.id);
  const toast = useToast();
  const [notes, setNotes] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Report ${asset.assetTag} lost`}
      description="Record that this asset cannot be found."
      submitLabel="Mark as lost"
      destructive
      isSubmitting={markLost.isPending}
      error={markLost.error}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!notes.trim()) return;
        markLost.mutate(
          { notes: notes.trim() },
          {
            onSuccess: () => {
              toast.success(`${asset.assetTag} marked lost`);
              onOpenChange(false);
            },
          },
        );
      }}
      consequence={
        asset.currentHolder ? (
          <>
            The open assignment to <strong>{asset.currentHolder.fullName}</strong> is written off
            without a return, and the asset moves to <strong>Lost</strong>. Their name stays in the
            asset history.
          </>
        ) : (
          <>
            The asset moves to <strong>Lost</strong>. If it turns up later it can be recovered back
            into stock.
          </>
        )
      }
    >
      <div className="space-y-2">
        <Label htmlFor="lost-notes">What happened</Label>
        <Textarea
          id="lost-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Where it was last seen, any reference number"
          aria-invalid={touched && !notes.trim()}
        />
        <FieldError message={touched && !notes.trim() ? 'An explanation is required' : undefined} />
      </div>
    </ActionDialog>
  );
}

export function RecoverDialog({ asset, open, onOpenChange }: DialogProps): JSX.Element {
  const recover = useRecoverAsset(asset.id);
  const toast = useToast();
  const [conditionGrade, setConditionGrade] = React.useState<ConditionGrade | ''>('');
  const [notes, setNotes] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Recover ${asset.assetTag}`}
      description="This asset has turned up."
      submitLabel="Return to stock"
      isSubmitting={recover.isPending}
      error={recover.error}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!conditionGrade || !notes.trim()) return;
        recover.mutate(
          { conditionGrade, notes: notes.trim() },
          {
            onSuccess: () => {
              toast.success(`${asset.assetTag} recovered`);
              onOpenChange(false);
            },
          },
        );
      }}
      consequence="The asset returns to stock and becomes issuable again. The period it was lost stays in the history."
    >
      <ConditionSelect
        id="recover-condition"
        label="Condition as found"
        value={conditionGrade}
        onChange={setConditionGrade}
      />
      <FieldError message={touched && !conditionGrade ? 'Choose a condition' : undefined} />

      <div className="space-y-2">
        <Label htmlFor="recover-notes">Where it was found</Label>
        <Textarea
          id="recover-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          aria-invalid={touched && !notes.trim()}
        />
        <FieldError message={touched && !notes.trim() ? 'Required' : undefined} />
      </div>
    </ActionDialog>
  );
}

export function RetireDialog({ asset, open, onOpenChange }: DialogProps): JSX.Element {
  const retire = useRetireAsset(asset.id);
  const toast = useToast();
  const [notes, setNotes] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Retire ${asset.assetTag}`}
      description="Take this asset out of service permanently."
      submitLabel="Retire asset"
      destructive
      isSubmitting={retire.isPending}
      error={retire.error}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!notes.trim()) return;
        retire.mutate(
          { notes: notes.trim() },
          {
            onSuccess: () => {
              toast.success(`${asset.assetTag} retired`);
              onOpenChange(false);
            },
          },
        );
      }}
      consequence={
        <>
          <strong>Retired is terminal.</strong> The asset can never be issued, repaired or recovered
          again. Its record and history stay in the system permanently.
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="retire-notes">Reason</Label>
        <Textarea
          id="retire-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="End of useful life, beyond economical repair, disposed of as e-waste…"
          aria-invalid={touched && !notes.trim()}
        />
        <FieldError message={touched && !notes.trim() ? 'A reason is required' : undefined} />
      </div>
    </ActionDialog>
  );
}

export function AddNoteDialog({ asset, open, onOpenChange }: DialogProps): JSX.Element {
  const addNote = useAddAssetNote(asset.id);
  const toast = useToast();
  const [notes, setNotes] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Add a note to ${asset.assetTag}`}
      description="Notes are appended to the history and can never be edited or removed."
      submitLabel="Add note"
      isSubmitting={addNote.isPending}
      error={addNote.error}
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!notes.trim()) return;
        addNote.mutate(
          { notes: notes.trim() },
          {
            onSuccess: () => {
              toast.success('Note added');
              onOpenChange(false);
            },
          },
        );
      }}
      consequence="A NOTE_ADDED event is written. Corrections are made by adding another note, never by editing this one."
    >
      <div className="space-y-2">
        <Label htmlFor="asset-note">Note</Label>
        <Textarea
          id="asset-note"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          aria-invalid={touched && !notes.trim()}
        />
        <FieldError message={touched && !notes.trim() ? 'Write something first' : undefined} />
      </div>
    </ActionDialog>
  );
}
