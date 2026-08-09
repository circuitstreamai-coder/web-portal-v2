import { restRequest } from '$lib/api/rest';

export interface AdminDashboardSummary {
  totalTickets: number;
  activeEngineers: number;
  openProjects: number;
  customers: number;
}

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary;
  generatedAt?: string;
}

export async function fetchAdminDashboardData(): Promise<AdminDashboardResponse> {
  return restRequest<AdminDashboardResponse>('/api/admin/dashboard');
}
