export type UserRoleKey = 'Super_Admin' | 'Admin' | 'Marketing_Employee' | 'Operator' | 'Viewer';

export interface UserFixture {
  id?: string;
  email: string;
  fullName: string;
  role: UserRoleKey;
  accountStatus: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
  password: string;
}

export const USER_CREDENTIALS: Record<UserRoleKey, { email: string; password: string; fullName: string }> = {
  Super_Admin: {
    email: 'superadmin@wealthtrade.in',
    password: 'SuperAdmin@2026!',
    fullName: 'System Super Admin',
  },
  Admin: {
    email: 'admin@wealthtrade.in',
    password: 'Admin@2026!',
    fullName: 'Operations Admin',
  },
  Marketing_Employee: {
    email: 'marketing@wealthtrade.in',
    password: 'Marketing@2026!',
    fullName: 'Lead Marketing Specialist',
  },
  Operator: {
    email: 'operator@wealthtrade.in',
    password: 'Operator@2026!',
    fullName: 'Support Operator',
  },
  Viewer: {
    email: 'viewer@wealthtrade.in',
    password: 'Viewer@2026!',
    fullName: 'Executive Viewer',
  },
};

export const TEST_USERS: Record<UserRoleKey, UserFixture> = {
  Super_Admin: {
    email: USER_CREDENTIALS.Super_Admin.email,
    fullName: USER_CREDENTIALS.Super_Admin.fullName,
    role: 'Super_Admin',
    accountStatus: 'ACTIVE',
    password: USER_CREDENTIALS.Super_Admin.password,
  },
  Admin: {
    email: USER_CREDENTIALS.Admin.email,
    fullName: USER_CREDENTIALS.Admin.fullName,
    role: 'Admin',
    accountStatus: 'ACTIVE',
    password: USER_CREDENTIALS.Admin.password,
  },
  Marketing_Employee: {
    email: USER_CREDENTIALS.Marketing_Employee.email,
    fullName: USER_CREDENTIALS.Marketing_Employee.fullName,
    role: 'Marketing_Employee',
    accountStatus: 'ACTIVE',
    password: USER_CREDENTIALS.Marketing_Employee.password,
  },
  Operator: {
    email: USER_CREDENTIALS.Operator.email,
    fullName: USER_CREDENTIALS.Operator.fullName,
    role: 'Operator',
    accountStatus: 'ACTIVE',
    password: USER_CREDENTIALS.Operator.password,
  },
  Viewer: {
    email: USER_CREDENTIALS.Viewer.email,
    fullName: USER_CREDENTIALS.Viewer.fullName,
    role: 'Viewer',
    accountStatus: 'ACTIVE',
    password: USER_CREDENTIALS.Viewer.password,
  },
};

export const ROLE_PERMISSIONS_MATRIX: Record<UserRoleKey, {
  canManageUsers: boolean;
  canManageSettings: boolean;
  canViewAuditLogs: boolean;
  canApproveCampaigns: boolean;
  canExecuteCampaigns: boolean;
  canCreateTemplates: boolean;
  canImportClients: boolean;
  canEraseClients: boolean;
  canViewAnalytics: boolean;
  dashboardRoute: string;
}> = {
  Super_Admin: {
    canManageUsers: true,
    canManageSettings: true,
    canViewAuditLogs: true,
    canApproveCampaigns: true,
    canExecuteCampaigns: true,
    canCreateTemplates: true,
    canImportClients: true,
    canEraseClients: true,
    canViewAnalytics: true,
    dashboardRoute: '/admin/governance',
  },
  Admin: {
    canManageUsers: false,
    canManageSettings: false,
    canViewAuditLogs: true,
    canApproveCampaigns: true,
    canExecuteCampaigns: true,
    canCreateTemplates: true,
    canImportClients: true,
    canEraseClients: true,
    canViewAnalytics: true,
    dashboardRoute: '/admin/operations',
  },
  Marketing_Employee: {
    canManageUsers: false,
    canManageSettings: false,
    canViewAuditLogs: false,
    canApproveCampaigns: false,
    canExecuteCampaigns: false,
    canCreateTemplates: true,
    canImportClients: false,
    canEraseClients: false,
    canViewAnalytics: true,
    dashboardRoute: '/marketing/hub',
  },
  Operator: {
    canManageUsers: false,
    canManageSettings: false,
    canViewAuditLogs: false,
    canApproveCampaigns: false,
    canExecuteCampaigns: false,
    canCreateTemplates: false,
    canImportClients: true,
    canEraseClients: false,
    canViewAnalytics: false,
    dashboardRoute: '/operator/engagement',
  },
  Viewer: {
    canManageUsers: false,
    canManageSettings: false,
    canViewAuditLogs: false,
    canApproveCampaigns: false,
    canExecuteCampaigns: false,
    canCreateTemplates: false,
    canImportClients: false,
    canEraseClients: false,
    canViewAnalytics: true,
    dashboardRoute: '/analytics/viewer',
  },
};

export const INVALID_USER_CREDENTIALS = [
  { description: 'Non-existent email', email: 'unknown_ghost@wealthtrade.in', password: 'Password123!' },
  { description: 'Wrong password', email: USER_CREDENTIALS.Super_Admin.email, password: 'WrongPassword999!' },
  { description: 'Empty password', email: USER_CREDENTIALS.Super_Admin.email, password: '' },
  { description: 'Empty email', email: '', password: 'Password123!' },
  { description: 'Malformed email', email: 'not-an-email', password: 'Password123!' },
  { description: 'SQL Injection attempt', email: "' OR '1'='1' --", password: 'Password123!' },
];
