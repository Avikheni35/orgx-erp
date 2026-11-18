export type M3UserRole =
  | 'super_admin'
  | 'erp_admin'
  | 'erp_accountant'
  | 'erp_viewer'
  | 'erp_employee'
  | 'erp_tax_advisor'
  | 'agency_admin'
  | 'disponent';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: M3UserRole;
  tenantId: string | null;
  language: 'de' | 'en';
}

export function portalHome(role: M3UserRole): string {
  if (role === 'erp_employee') return '/ops/sales';
  return '/erp/dashboard';
}

export function hasErpAccess(role: M3UserRole): boolean {
  return ['super_admin', 'erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'erp_tax_advisor', 'agency_admin', 'disponent'].includes(role);
}
