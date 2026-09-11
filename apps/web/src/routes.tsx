import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/components/layout/protected-route';
import { LoginPage } from '@/pages/login';
import { DashboardPage } from '@/pages/dashboard';
import { AssetsListPage } from '@/pages/assets-list';
import { AssetDetailPage } from '@/pages/asset-detail';
import { EmployeesListPage } from '@/pages/employees-list';
import { EmployeeDetailPage } from '@/pages/employee-detail';
import { NotFoundPage } from '@/pages/not-found';

/**
 * Everything except the login screen sits behind ProtectedRoute. Screens for
 * stock, purchases, repairs, reports and masters are added here as their build
 * phases land (CLAUDE.md §12).
 */
export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'assets', element: <AssetsListPage /> },
          { path: 'assets/:id', element: <AssetDetailPage /> },
          { path: 'employees', element: <EmployeesListPage /> },
          { path: 'employees/:id', element: <EmployeeDetailPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

// The explicit annotation keeps the declaration portable: pnpm's strict
// node_modules layout means the inferred type cannot otherwise be named.
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes);
