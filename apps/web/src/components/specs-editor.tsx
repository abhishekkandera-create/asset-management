import { Plus, X } from 'lucide-react';
import type { AssetSpecs } from '@asset/shared';
import { specLabel } from '@/lib/specs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Rows are keyed so React does not reorder inputs as keys are typed. */
export interface SpecRow {
  id: number;
  key: string;
  value: string;
}

let nextRowId = 0;
const newRow = (key = '', value = ''): SpecRow => ({ id: (nextRowId += 1), key, value });

export function specsToRows(specs: AssetSpecs | undefined | null): SpecRow[] {
  const entries = Object.entries(specs ?? {});
  return entries.length > 0
    ? entries.map(([key, value]) => newRow(key, String(value)))
    : [newRow()];
}

/**
 * Back to a JSON blob. A value that reads as a number or a boolean is stored as
 * one, so `16` sorts and formats as a number rather than the string "16" —
 * matching the shape the seeded models already use.
 */
export function rowsToSpecs(rows: SpecRow[]): AssetSpecs {
  const specs: AssetSpecs = {};

  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || !value) continue;

    if (/^-?\d+(\.\d+)?$/.test(value)) {
      specs[key] = Number(value);
    } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
      specs[key] = value.toLowerCase() === 'true';
    } else {
      specs[key] = value;
    }
  }

  return specs;
}

/** Keys the formatter already knows how to label and unit, offered as hints. */
const SUGGESTED_KEYS = [
  'cpu',
  'ramGb',
  'storageGb',
  'screenInches',
  'os',
  'graphics',
  'resolution',
  'panel',
  'ports',
  'power',
  'connector',
  'connection',
  'wireless',
  'weightKg',
];

interface SpecsEditorProps {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
}

/**
 * A key/value editor for the model's free-form spec blob. Deliberately not a
 * fixed set of fields: a laptop and a charger share no attributes, which is why
 * the column is JSON in the first place.
 */
export function SpecsEditor({ rows, onChange }: SpecsEditorProps): JSX.Element {
  const update = (id: number, patch: Partial<SpecRow>): void => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Specifications</Label>
        <span className="text-xs text-muted-foreground">
          Shown on every asset of this model
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const preview = row.key.trim() ? specLabel(row.key.trim()) : null;

          return (
            <div key={row.id} className="flex items-start gap-2">
              <div className="w-[38%] min-w-0">
                <Input
                  value={row.key}
                  onChange={(event) => update(row.id, { key: event.target.value })}
                  placeholder="ramGb"
                  list="spec-key-suggestions"
                  aria-label="Specification name"
                />
                {preview && preview.toLowerCase() !== row.key.trim().toLowerCase() ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">shows as “{preview}”</p>
                ) : null}
              </div>

              <Input
                value={row.value}
                onChange={(event) => update(row.id, { value: event.target.value })}
                placeholder="16"
                className="flex-1"
                aria-label="Specification value"
              />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this specification"
                onClick={() =>
                  onChange(rows.length > 1 ? rows.filter((r) => r.id !== row.id) : [newRow()])
                }
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          );
        })}
      </div>

      <datalist id="spec-key-suggestions">
        {SUGGESTED_KEYS.map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>

      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, newRow()])}>
        <Plus className="h-4 w-4" aria-hidden />
        Add specification
      </Button>

      <p className="text-xs text-muted-foreground">
        Known names like <code>ramGb</code> or <code>storageGb</code> get a proper label and unit
        automatically — 16 becomes “Memory · 16 GB”. Anything else is shown as typed.
      </p>
    </div>
  );
}
