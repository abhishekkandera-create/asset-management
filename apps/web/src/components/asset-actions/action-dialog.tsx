import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { messageOf } from '@/lib/api-error';

interface ActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** A plain-language summary of the consequence (CLAUDE.md §9 UI conventions). */
  consequence?: React.ReactNode;
  submitLabel: string;
  destructive?: boolean;
  isSubmitting: boolean;
  error: unknown;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  /** Widen the dialog for forms with more than a handful of fields. */
  className?: string;
}

/**
 * The shell every state-changing action shares: a form, a summary of what the
 * action will do, and the server's own error message if it refuses.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  consequence,
  submitLabel,
  destructive = false,
  isSubmitting,
  error,
  onSubmit,
  children,
  className,
}: ActionDialogProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden />
              <AlertDescription>{messageOf(error)}</AlertDescription>
            </Alert>
          ) : null}

          {children}

          {consequence ? (
            <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
              {consequence}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? 'destructive' : 'default'}
              loading={isSubmitting}
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FieldError({ message }: { message?: string }): JSX.Element | null {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}
