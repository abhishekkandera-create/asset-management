import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, History, Package } from 'lucide-react';
import type { Assignment } from '@asset/shared';
import {
  useEmployee,
  useEmployeeAssignments,
  useEmployeeClearance,
  useEmployeeHoldings,
} from '@/hooks/use-employees';
import { formatDate } from '@/lib/utils';
import { messageOf } from '@/lib/api-error';
import { ClearancePanel } from '@/components/clearance-panel';
import { ConditionBadge } from '@/components/condition-badge';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function EmployeeDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { data: employee, isLoading, isError, error } = useEmployee(id);
  const holdings = useEmployeeHoldings(id);
  const assignments = useEmployeeAssignments(id);
  const clearance = useEmployeeClearance(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !employee) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Alert variant="destructive">
          <CircleAlert className="h-4 w-4" aria-hidden />
          <AlertTitle>Could not load this employee</AlertTitle>
          <AlertDescription>{messageOf(error)}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/employees">Back to employees</Link>
        </Button>
      </div>
    );
  }

  const currentlyHeld = holdings.data?.assignments ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/employees">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to employees
        </Link>
      </Button>

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{employee.fullName}</h1>
              {employee.status === 'ACTIVE' ? (
                <Badge variant="secondary">Active</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Exited {formatDate(employee.dateExited)}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {employee.designation} · {employee.department}
            </p>
            <dl className="mt-3 grid grid-cols-[minmax(0,120px)_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Employee code</dt>
              <dd>{employee.employeeCode}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{employee.email}</dd>
              {employee.phone ? (
                <>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{employee.phone}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Location</dt>
              <dd>{employee.location?.name ?? '—'}</dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{formatDate(employee.dateJoined)}</dd>
              {employee.reportingManager ? (
                <>
                  <dt className="text-muted-foreground">Reports to</dt>
                  <dd>
                    <Link
                      to={`/employees/${employee.reportingManager.id}`}
                      className="text-primary hover:underline"
                    >
                      {employee.reportingManager.fullName}
                    </Link>
                  </dd>
                </>
              ) : null}
            </dl>
          </div>

          <div className="rounded-lg border p-4 text-center">
            <p className="text-3xl font-semibold tabular-nums">{currentlyHeld.length}</p>
            <p className="text-xs text-muted-foreground">
              asset{currentlyHeld.length === 1 ? '' : 's'} held
            </p>
          </div>
        </CardContent>
      </Card>

      {clearance.data ? <ClearancePanel clearance={clearance.data} /> : null}

      <Tabs defaultValue="holdings">
        <TabsList>
          <TabsTrigger value="holdings">Currently held ({currentlyHeld.length})</TabsTrigger>
          <TabsTrigger value="history">
            Assignment history
            {assignments.data ? (
              <span className="ml-1.5 text-xs text-muted-foreground">
                ({assignments.data.meta.total})
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Currently held</CardTitle>
              <CardDescription>Read from the open rows in the assignment ledger.</CardDescription>
            </CardHeader>
            <CardContent>
              {holdings.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : currentlyHeld.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Holding nothing"
                  description="Assets issued to this employee will appear here."
                  className="border-0"
                />
              ) : (
                <AssignmentTable assignments={currentlyHeld} showReturn={false} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Everything they have ever held</CardTitle>
              <CardDescription>
                Closed and written-off assignments are kept permanently.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignments.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (assignments.data?.data.length ?? 0) === 0 ? (
                <EmptyState
                  icon={History}
                  title="No assignment history"
                  description="This employee has never been issued an asset."
                  className="border-0"
                />
              ) : (
                <AssignmentTable assignments={assignments.data?.data ?? []} showReturn />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AssignmentTable({
  assignments,
  showReturn,
}: {
  assignments: Assignment[];
  showReturn: boolean;
}): JSX.Element {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Asset</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Out</TableHead>
          {showReturn ? <TableHead>Returned</TableHead> : <TableHead>Due back</TableHead>}
          {showReturn ? <TableHead>In</TableHead> : <TableHead>Held for</TableHead>}
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assignments.map((assignment) => (
          <TableRow key={assignment.id}>
            <TableCell>
              <Link
                to={`/assets/${assignment.assetId}`}
                className="font-medium text-primary hover:underline"
              >
                {assignment.asset?.assetTag}
              </Link>
              <span className="block text-xs text-muted-foreground">
                {assignment.asset?.manufacturer} {assignment.asset?.modelName}
              </span>
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(assignment.issuedOn)}</TableCell>
            <TableCell>
              <ConditionBadge grade={assignment.conditionOut} />
            </TableCell>
            {showReturn ? (
              <TableCell className="whitespace-nowrap">
                {assignment.returnedOn ? (
                  formatDate(assignment.returnedOn)
                ) : assignment.status === 'WRITTEN_OFF' ? (
                  <span className="text-muted-foreground">never returned</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            ) : (
              <TableCell className="whitespace-nowrap">
                {assignment.expectedReturnOn ? formatDate(assignment.expectedReturnOn) : '—'}
              </TableCell>
            )}
            {showReturn ? (
              <TableCell>
                {assignment.conditionIn ? <ConditionBadge grade={assignment.conditionIn} /> : '—'}
              </TableCell>
            ) : (
              <TableCell className="tabular-nums">{assignment.heldForDays} days</TableCell>
            )}
            <TableCell>
              {assignment.status === 'OPEN' ? (
                <Badge variant="secondary">Open</Badge>
              ) : assignment.status === 'CLOSED' ? (
                <Badge variant="outline">Returned</Badge>
              ) : (
                <Badge variant="destructive">Written off</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
