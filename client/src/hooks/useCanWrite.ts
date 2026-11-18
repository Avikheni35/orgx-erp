import { useAuthStore } from '../stores/authStore';

const READ_ONLY_ROLES = new Set(['erp_viewer', 'erp_tax_advisor', 'erp_employee']);

export function useCanWrite(): boolean {
  const user = useAuthStore(s => s.user);
  if (!user) return false;
  return !READ_ONLY_ROLES.has(user.role);
}
