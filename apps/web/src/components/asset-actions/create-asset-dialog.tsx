import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CONDITION_GRADES,
  createAssetSchema,
  dateOnlySchema,
  type Asset,
  type CreateAsset,
} from '@asset/shared';
import { useCreateAsset } from '@/hooks/use-assets';
import { useCategories, useLocations, useModels } from '@/hooks/use-masters';
import { useToast } from '@/hooks/use-toast';
import { conditionLabel } from '@/components/condition-badge';
import { ActionDialog, FieldError } from './action-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * An empty HTML input reports '' — which is not a valid date, and not the same
 * as "not provided". Optional fields therefore treat a blank as absent before
 * the shared schema sees it; otherwise the form fails validation silently and
 * the dialog just sits there.
 */
function blankIsAbsent<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const assetFormSchema = createAssetSchema.extend({
  serialNumber: blankIsAbsent(z.string().trim().max(80)),
  warrantyExpiresOn: blankIsAbsent(dateOnlySchema),
  notes: blankIsAbsent(z.string().trim().max(2000)),
});

type AssetFormValues = z.infer<typeof assetFormSchema>;

interface CreateAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (asset: Asset) => void;
}

/**
 * Adds one individually tracked unit. Bulk categories are deliberately absent
 * from the picker — they are counted in stock, not created one row at a time
 * (CLAUDE.md §1), and the API rejects them anyway.
 */
export function CreateAssetDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateAssetDialogProps): JSX.Element {
  const create = useCreateAsset();
  const toast = useToast();
  const categories = useCategories();
  const locations = useLocations();
  const [categoryId, setCategoryId] = React.useState('');
  const models = useModels(categoryId || undefined);

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      assetTag: '',
      serialNumber: '',
      modelId: '',
      conditionGrade: 'NEW',
      locationId: '',
      warrantyExpiresOn: '',
      notes: '',
    },
  });

  const { errors } = form.formState;

  const serializedCategories = (categories.data?.data ?? []).filter(
    (category) => category.trackingMode === 'SERIALIZED' && category.isActive,
  );
  const selectedCategory = serializedCategories.find((category) => category.id === categoryId);
  const selectedModel = (models.data?.data ?? []).find((model) => model.id === form.watch('modelId'));

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      {
        ...values,
        serialNumber: values.serialNumber ?? null,
        warrantyExpiresOn: values.warrantyExpiresOn ?? null,
      },
      {
        onSuccess: (asset) => {
          toast.success(`${asset.assetTag} added`, 'It is in stock and ready to issue.');
          onCreated?.(asset);
          onOpenChange(false);
        },
      },
    );
  });

  return (
    <ActionDialog
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-2xl"
      title="Add an asset"
      description="One individually tracked unit — a laptop, monitor, dock or headset."
      submitLabel="Add asset"
      isSubmitting={create.isPending}
      error={create.error}
      onSubmit={onSubmit}
      consequence={
        <>
          The asset is created <strong>in stock</strong> and can be issued immediately.
          A STOCK_IN event starts its history. The asset tag can never be changed
          afterwards, so check it before saving.
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value);
              // The old model belongs to the old category.
              form.setValue('modelId', '', { shouldValidate: false });
            }}
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {serializedCategories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Bulk categories such as chargers are counted in stock, not added individually.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="modelId">Model</Label>
          <Select
            value={form.watch('modelId')}
            onValueChange={(value) => form.setValue('modelId', value, { shouldValidate: true })}
            disabled={!categoryId}
          >
            <SelectTrigger id="modelId" aria-invalid={Boolean(errors.modelId)}>
              <SelectValue placeholder={categoryId ? 'Pick a model' : 'Pick a category first'} />
            </SelectTrigger>
            <SelectContent>
              {(models.data?.data ?? [])
                .filter((model) => model.isActive)
                .map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.manufacturer} {model.modelName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.modelId?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="assetTag">Asset tag</Label>
          <Input
            id="assetTag"
            placeholder="LAP-0201"
            autoFocus
            aria-invalid={Boolean(errors.assetTag)}
            {...form.register('assetTag')}
          />
          <FieldError message={errors.assetTag?.message} />
          <p className="text-xs text-muted-foreground">
            Immutable once saved — it is usually stuck to the device.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="serialNumber">
            Serial number{selectedCategory?.requiresSerial ? '' : ' (optional)'}
          </Label>
          <Input
            id="serialNumber"
            placeholder="DL500231"
            aria-invalid={Boolean(errors.serialNumber)}
            {...form.register('serialNumber')}
          />
          <FieldError message={errors.serialNumber?.message} />
          {selectedCategory?.requiresSerial ? (
            <p className="text-xs text-muted-foreground">
              {selectedCategory.name} requires a serial number.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locationId">Owning location</Label>
          <Select
            value={form.watch('locationId')}
            onValueChange={(value) => form.setValue('locationId', value, { shouldValidate: true })}
          >
            <SelectTrigger id="locationId" aria-invalid={Boolean(errors.locationId)}>
              <SelectValue placeholder="Which store room it belongs to" />
            </SelectTrigger>
            <SelectContent>
              {(locations.data?.data ?? [])
                .filter((location) => location.isActive)
                .map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name} · {location.city}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <FieldError message={errors.locationId?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="conditionGrade">Condition</Label>
          <Select
            value={form.watch('conditionGrade')}
            onValueChange={(value) =>
              form.setValue('conditionGrade', value as CreateAsset['conditionGrade'], {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger id="conditionGrade">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_GRADES.map((grade) => (
                <SelectItem key={grade} value={grade}>
                  {conditionLabel(grade)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="warrantyExpiresOn">Warranty expires on (optional)</Label>
        <Input id="warrantyExpiresOn" type="date" {...form.register('warrantyExpiresOn')} />
        <p className="text-xs text-muted-foreground">
          {selectedModel?.defaultWarrantyMonths
            ? `Leave blank to use this model's default of ${selectedModel.defaultWarrantyMonths} months from today.`
            : 'Leave blank if it is out of warranty or unknown.'}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" rows={2} placeholder="Anything worth recording about this unit" {...form.register('notes')} />
      </div>
    </ActionDialog>
  );
}
