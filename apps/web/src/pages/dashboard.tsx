import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  PackageOpen,
  ShieldAlert,
  Users,
  Wrench,
} from 'lucide-react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AssetStatus, DashboardSummary } from '@asset/shared';
import { useDashboardSummary } from '@/hooks/use-dashboard';
import { useAuth } from '@/hooks/use-auth';
import { statusLabel } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { messageOf } from '@/lib/api-error';

const STATUS_COLOURS: Record<AssetStatus, string> = {
  IN_STOCK: 'hsl(var(--status-stock))',
  ASSIGNED: 'hsl(var(--status-assigned))',
  RETURNED_PENDING_CHECK: 'hsl(var(--status-pending))',
  IN_REPAIR: 'hsl(var(--status-repair))',
  RETIRED: 'hsl(var(--status-retired))',
  LOST: 'hsl(var(--status-lost))',
};

export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useDashboardSummary();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {user ? `Signed in as ${user.fullName}` : null}
        </p>
      </header>

      {isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>Could not load the dashboard</AlertTitle>
          <AlertDescription>{messageOf(error)}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? <DashboardSkeleton /> : null}

      {data ? <DashboardContent summary={data} /> : null}
    </div>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }): JSX.Element {
  const hasAssets = summary.totals.assets > 0;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Boxes}
          label="Total assets"
          value={summary.totals.assets}
          hint="Individually tracked units"
        />
        <StatTile
          icon={BadgeCheck}
          label="Assigned"
          value={summary.totals.assigned}
          hint={`${summary.totals.openAssignments} open assignments`}
        />
        <StatTile
          icon={PackageOpen}
          label="In stock"
          value={summary.totals.inStock}
          hint="Ready to issue"
        />
        <StatTile
          icon={Users}
          label="Active employees"
          value={summary.totals.employeesActive}
          hint="Exited employees keep their history"
        />
      </section>

      {!hasAssets ? (
        <EmptyState
          icon={Boxes}
          title="No assets yet"
          description="Once hardware is added, this dashboard shows what is in stock, what is issued, and what needs attention."
        />
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assets by status</CardTitle>
                <CardDescription>Where every tracked unit currently sits</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={summary.assetsByStatus
                          .filter((row) => row.count > 0)
                          .map((row) => ({
                            name: statusLabel(row.status),
                            value: row.count,
                            status: row.status,
                          }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {summary.assetsByStatus
                          .filter((row) => row.count > 0)
                          .map((row) => (
                            <Cell key={row.status} fill={STATUS_COLOURS[row.status]} />
                          ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 'var(--radius)',
                          fontSize: '0.8125rem',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value) => <span className="text-xs">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Assets by category</CardTitle>
                <CardDescription>
                  Serialized units only; bulk items are counted separately
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.assetsByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No categories with assets yet.</p>
                ) : (
                  summary.assetsByCategory.map((row) => {
                    const share = summary.totals.assets
                      ? Math.round((row.count / summary.totals.assets) * 100)
                      : 0;
                    return (
                      <div key={row.categoryId} className="space-y-1">
                        <div className="flex items-baseline justify-between text-sm">
                          <span>{row.categoryName}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {row.count} · {share}%
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Warranties expiring</CardTitle>
                <CardDescription>Excludes retired and lost hardware</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {(
                    [
                      ['Within 30 days', summary.warrantyExpiring.in30Days],
                      ['Within 60 days', summary.warrantyExpiring.in60Days],
                      ['Within 90 days', summary.warrantyExpiring.in90Days],
                    ] as const
                  ).map(([label, count]) => (
                    <div key={label} className="flex items-center justify-between">
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{count}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Needs attention</CardTitle>
                <CardDescription>Items sitting in a holding state</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <AttentionRow
                    icon={ShieldAlert}
                    label="Awaiting inspection"
                    value={countFor(summary, 'RETURNED_PENDING_CHECK')}
                  />
                  <AttentionRow
                    icon={Wrench}
                    label="In repair"
                    value={countFor(summary, 'IN_REPAIR')}
                  />
                  <AttentionRow
                    icon={AlertTriangle}
                    label="Reported lost"
                    value={countFor(summary, 'LOST')}
                  />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Low stock</CardTitle>
                <CardDescription>Bulk items below their reorder level</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.lowStock.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Bulk stock tracking arrives in a later build phase.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {summary.lowStock.map((row) => (
                      <li
                        key={`${row.modelId}-${row.locationId}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>
                          {row.manufacturer} {row.modelName}
                          <span className="block text-xs text-muted-foreground">
                            {row.locationName}
                          </span>
                        </span>
                        <span className="tabular-nums text-destructive">
                          {row.quantityOnHand} / {row.reorderLevel}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </>
  );
}

function countFor(summary: DashboardSummary, status: AssetStatus): number {
  return summary.assetsByStatus.find((row) => row.status === status)?.count ?? 0;
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-6">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function AttentionRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
        {label}
      </dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function DashboardSkeleton(): JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[340px]" />
        <Skeleton className="h-[340px]" />
      </div>
    </div>
  );
}
