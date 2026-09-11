import * as React from 'react';
import type { AssetModel } from '@asset/shared';
import { useCategories, useCreateModel, useUpdateModel } from '@/hooks/use-masters';
import { useToast } from '@/hooks/use-toast';
import { ActionDialog, FieldError } from '@/components/asset-actions/action-dialog';
import { SpecsEditor, rowsToSpecs, specsToRows, type SpecRow } from '@/components/specs-editor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ModelDialogProps {
  /** Absent when adding; present when editing. */
  model?: AssetModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Add or edit a model and its specifications. Specs live on the model rather
 * than the asset (CLAUDE.md §5.1), so editing them here updates what every unit
 * of that model displays.
 */
export function ModelDialog({ model, open, onOpenChange }: ModelDialogProps): JSX.Element {
  const isEdit = Boolean(model);
  const categories = useCategories();
  const toast = useToast();
  const create = useCreateModel();
  const update = useUpdateModel(model?.id ?? '');
  const mutation = isEdit ? update : create;

  const [categoryId, setCategoryId] = React.useState(model?.categoryId ?? '');
  const [manufacturer, setManufacturer] = React.useState(model?.manufacturer ?? '');
  const [modelName, setModelName] = React.useState(model?.modelName ?? '');
  const [warrantyMonths, setWarrantyMonths] = React.useState(
    model?.defaultWarrantyMonths != null ? String(model.defaultWarrantyMonths) : '',
  );
  const [rows, setRows] = React.useState<SpecRow[]>(() => specsToRows(model?.specs));
  const [touched, setTouched] = React.useState(false);

  const activeCategories = (categories.data?.data ?? []).filter((category) => category.isActive);
  const selectedCategory = activeCategories.find((category) => category.id === categoryId);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTouched(true);
    if (!categoryId || !manufacturer.trim() || !modelName.trim()) return;

    const payload = {
      categoryId,
      manufacturer: manufacturer.trim(),
      modelName: modelName.trim(),
      specs: rowsToSpecs(rows),
      defaultWarrantyMonths: warrantyMonths.trim() ? Number(warrantyMonths) : null,
      isActive: model?.isActive ?? true,
    };

    mutation.mutate(payload, {
      onSuccess: (saved) => {
        toast.success(
          isEdit ? 'Model updated' : 'Model added',
          `${saved.manufacturer} ${saved.modelName}`,
        );
        onOpenChange(false);
      },
    });
  };

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-2xl"
      title={isEdit ? `Edit ${model?.manufacturer} ${model?.modelName}` : 'Add a model'}
      description={
        isEdit
          ? 'Changes to specifications show on every asset of this model.'
          : 'A product you buy — assets are then created against it.'
      }
      submitLabel={isEdit ? 'Save changes' : 'Add model'}
      isSubmitting={mutation.isPending}
      error={mutation.error}
      onSubmit={handleSubmit}
      consequence={
        isEdit
          ? 'Specifications are stored on the model, so this updates what every unit of it displays.'
          : 'Once added, you can create assets against this model straight away.'
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="model-category">Category</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="model-category" aria-invalid={touched && !categoryId}>
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {activeCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                  {category.trackingMode === 'BULK' ? ' · bulk' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={touched && !categoryId ? 'Choose a category' : undefined} />
          {selectedCategory?.trackingMode === 'BULK' ? (
            <p className="text-xs text-muted-foreground">
              Bulk items are counted in stock rather than tracked individually.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="model-warranty">Default warranty (months)</Label>
          <Input
            id="model-warranty"
            type="number"
            min={0}
            max={240}
            value={warrantyMonths}
            onChange={(event) => setWarrantyMonths(event.target.value)}
            placeholder="36"
          />
          <p className="text-xs text-muted-foreground">
            Used to compute an asset&apos;s warranty expiry when none is entered.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="model-manufacturer">Manufacturer</Label>
          <Input
            id="model-manufacturer"
            value={manufacturer}
            onChange={(event) => setManufacturer(event.target.value)}
            placeholder="Dell"
            aria-invalid={touched && !manufacturer.trim()}
          />
          <FieldError message={touched && !manufacturer.trim() ? 'Required' : undefined} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="model-name">Model name</Label>
          <Input
            id="model-name"
            value={modelName}
            onChange={(event) => setModelName(event.target.value)}
            placeholder="Latitude 5450"
            aria-invalid={touched && !modelName.trim()}
          />
          <FieldError message={touched && !modelName.trim() ? 'Required' : undefined} />
        </div>
      </div>

      <SpecsEditor rows={rows} onChange={setRows} />
    </ActionDialog>
  );
}
