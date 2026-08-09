import type { Role } from '$lib/config/roles';

export function redirectAfterLogin(role: Role | null | undefined): string {
  switch (role) {
    case 'super_admin':
      return '/admin';
    case 'national_head':
      return '/national-head/dashboard';
    case 'engineer':
    case 'l2_engineer':
    case 'l3_engineer':
      return '/engineer';
    case 'customer':
      return '/customer';
    case 'noc':
      return '/noc';
    case 'state_planner':
      return '/planner';
    case 'project_head':
      return '/project-head/dashboard';
    default:
      return '/';
  }
}
