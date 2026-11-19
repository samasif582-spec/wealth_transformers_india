export type UserRoleKey =
  | 'Super_Admin'
  | 'Admin'
  | 'Marketing_Employee'
  | 'Operator'
  | 'Viewer';

export const ROLE_DASHBOARD_ROUTES: Record<UserRoleKey, string> = {
  Super_Admin: '/dashboard/governance',
  Admin: '/dashboard/operations',
  Marketing_Employee: '/dashboard/marketing',
  Operator: '/dashboard/operator',
  Viewer: '/dashboard/analytics',
};

export const ROLE_SWITCHER_OPTIONS = [
  { role: 'Super_Admin' as const, label: 'Super Admin (Full Governance)' },
  { role: 'Admin' as const, label: 'Admin (Operations & Approvals)' },
  { role: 'Marketing_Employee' as const, label: 'Marketing (Creative & Campaigns)' },
  { role: 'Operator' as const, label: 'Operator (Engagement & Search)' },
  { role: 'Viewer' as const, label: 'Viewer (Read-Only Analytics)' },
];

export const CAMPAIGN_CREATIVE_ACTIONS = {
  label: 'Create New Campaign',
  targetRoute: '/campaigns/new',
  canCreateTemplates: true,
};

export function resolveRoleHome(role: UserRoleKey): string {
  return ROLE_DASHBOARD_ROUTES[role] || '/dashboard';
}

export function evaluateRouteAccess(
  userRole: UserRoleKey,
  targetRoute: string,
): { allowed: boolean; redirect?: string } {
  if (targetRoute === '/dashboard/governance' && userRole !== 'Super_Admin') {
    return { allowed: false, redirect: ROLE_DASHBOARD_ROUTES[userRole] };
  }
  if (
    targetRoute === '/dashboard/operations' &&
    userRole !== 'Super_Admin' &&
    userRole !== 'Admin'
  ) {
    return { allowed: false, redirect: ROLE_DASHBOARD_ROUTES[userRole] };
  }
  return { allowed: true };
}

export function resolveLandingRedirect(role: UserRoleKey): string {
  return resolveRoleHome(role);
}
