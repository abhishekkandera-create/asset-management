import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createEmployeeSchema, type CreateEmployee, type Employee } from '@asset/shared';
import { useCreateEmployee, useDepartments } from '@/hooks/use-employees';
import { useLocations } from '@/hooks/use-masters';
import { useToast } from '@/hooks/use-toast';
import { EmployeePicker } from '@/components/employee-picker';
import { ActionDialog, FieldError } from '@/components/asset-actions/action-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CreateEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (employee: Employee) => void;
}

/**
 * Adds a person to the system so hardware can be issued to them. Employees are
 * records, not users — this creates no login (CLAUDE.md §1).
 */
export function CreateEmployeeDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateEmployeeDialogProps): JSX.Element {
  const create = useCreateEmployee();
  const toast = useToast();
  const locations = useLocations();
  const departments = useDepartments();
  const [manager, setManager] = React.useState<Employee | null>(null);

  const form = useForm<CreateEmployee>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      employeeCode: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      department: '',
      designation: '',
      locationId: '',
      dateJoined: new Date().toISOString().slice(0, 10),
    },
  });

  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      {
        ...values,
        phone: values.phone?.trim() ? values.phone : null,
        reportingManagerId: manager?.id ?? null,
      },
      {
        onSuccess: (employee) => {
          toast.success(`${employee.fullName} added`, `${employee.employeeCode} can now be issued assets.`);
          onCreated?.(employee);
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
      title="Add an employee"
      description="A record of a person who can hold hardware. This does not create a login."
      submitLabel="Add employee"
      isSubmitting={create.isPending}
      error={create.error}
      onSubmit={onSubmit}
      consequence="The employee starts as Active and can be issued assets straight away. Employee records are never deleted — when they leave, they are marked as exited."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" autoFocus aria-invalid={Boolean(errors.firstName)} {...form.register('firstName')} />
          <FieldError message={errors.firstName?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" aria-invalid={Boolean(errors.lastName)} {...form.register('lastName')} />
          <FieldError message={errors.lastName?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="employeeCode">Employee code</Label>
          <Input
            id="employeeCode"
            placeholder="EMP1061"
            aria-invalid={Boolean(errors.employeeCode)}
            {...form.register('employeeCode')}
          />
          <FieldError message={errors.employeeCode?.message} />
          <p className="text-xs text-muted-foreground">Must be unique across the company.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" aria-invalid={Boolean(errors.email)} {...form.register('email')} />
          <FieldError message={errors.email?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Input
            id="department"
            list="department-options"
            placeholder="Engineering"
            aria-invalid={Boolean(errors.department)}
            {...form.register('department')}
          />
          {/* Existing departments as suggestions, but a new one can be typed. */}
          <datalist id="department-options">
            {(departments.data ?? []).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <FieldError message={errors.department?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="designation">Designation</Label>
          <Input
            id="designation"
            placeholder="Software Engineer"
            aria-invalid={Boolean(errors.designation)}
            {...form.register('designation')}
          />
          <FieldError message={errors.designation?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="locationId">Location</Label>
          <Select
            value={form.watch('locationId')}
            onValueChange={(value) => form.setValue('locationId', value, { shouldValidate: true })}
          >
            <SelectTrigger id="locationId" aria-invalid={Boolean(errors.locationId)}>
              <SelectValue placeholder="Where they sit" />
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
          <Label htmlFor="dateJoined">Joining date</Label>
          <Input id="dateJoined" type="date" aria-invalid={Boolean(errors.dateJoined)} {...form.register('dateJoined')} />
          <FieldError message={errors.dateJoined?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" placeholder="+91 98110 22345" {...form.register('phone')} />
          <FieldError message={errors.phone?.message} />
        </div>
        <div className="space-y-2">
          <Label>Reporting manager (optional)</Label>
          <EmployeePicker value={manager} onChange={setManager} />
        </div>
      </div>
    </ActionDialog>
  );
}
