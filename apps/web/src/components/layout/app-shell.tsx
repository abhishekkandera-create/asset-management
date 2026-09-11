import * as React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Boxes,
  Cpu,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Receipt,
  Settings,
  Users,
  Wrench,
} from 'lucide-react';
import type { UserRole } from '@asset/shared';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, initialsOf } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Minimum role. Absent means every signed-in user may see it. */
  minRole?: UserRole;
  /** Screens that arrive in a later phase are shown but not yet reachable. */
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assets', label: 'Assets', icon: Package },
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/stock', label: 'Stock', icon: Boxes, comingSoon: true },
  { to: '/purchases', label: 'Purchases', icon: Receipt, minRole: 'ADMIN', comingSoon: true },
  { to: '/repairs', label: 'Repairs', icon: Wrench, comingSoon: true },
  { to: '/reports', label: 'Reports', icon: ClipboardList, comingSoon: true },
  { to: '/masters/models', label: 'Models', icon: Cpu, minRole: 'ADMIN' },
  { to: '/masters', label: 'Masters', icon: Settings, minRole: 'ADMIN', comingSoon: true },
];

export function AppShell(): JSX.Element {
  const { user, signOut, can } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Package className="h-5 w-5 text-primary" aria-hidden />
          <span className="font-semibold">Asset Management</span>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {NAV_ITEMS.filter((item) => !item.minRole || can(item.minRole)).map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {user ? initialsOf(user.fullName) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.role}</p>
            </div>
          </div>
          <Button variant="ghost" className="mt-1 w-full justify-start" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6 md:hidden">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" aria-hidden />
            <span className="font-semibold">Asset Management</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItemLink({ item }: { item: NavItem }): JSX.Element {
  const Icon = item.icon;

  if (item.comingSoon) {
    return (
      <span
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
        title="Arrives in a later build phase"
      >
        <Icon className="h-4 w-4" aria-hidden />
        <span className="flex-1">{item.label}</span>
        <Badge variant="outline" className="text-[10px] font-normal">
          Soon
        </Badge>
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
        )
      }
    >
      <Icon className="h-4 w-4" aria-hidden />
      {item.label}
    </NavLink>
  );
}
