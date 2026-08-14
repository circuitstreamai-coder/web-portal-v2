import { restRequest } from "$lib/api/rest";
import { invalidate } from "$lib/stores/query";
import type { Customer } from "./queries";

// ── Input Types ─────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  companyName: string;
  contactPersonName: string;
  email?: string;
  phone?: string;
  addressState?: string;
  addressCity?: string;
  addressPincode?: string;
  author?: string;
}

export interface UpdateCustomerInput {
  id: string;
  companyName?: string;
  contactPersonName?: string;
  email?: string;
  phone?: string;
  addressState?: string;
  addressCity?: string;
  addressPincode?: string;
  secondaryContactName?: string;
  secondaryContactEmail?: string;
  secondaryContactPhone?: string;
}

export interface UpdateCustomerStatusInput {
  id: string;
  status: string;
  approvedBy?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const result = await restRequest<Customer>('/api/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  invalidate('customers');
  return result;
}

export async function updateCustomer(input: UpdateCustomerInput): Promise<Customer> {
  const { id, ...body } = input;
  const result = await restRequest<Customer>(`/api/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  invalidate('customers');
  return result;
}

export async function updateCustomerStatus(input: UpdateCustomerStatusInput): Promise<Customer> {
  const { id, ...body } = input;
  const result = await restRequest<Customer>(`/api/customers/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  invalidate('customers');
  return result;
}

export async function approveCustomer(id: string): Promise<Customer> {
  const result = await restRequest<Customer>(`/api/customers/${id}/approve`, {
    method: 'PATCH',
  });
  invalidate('customers');
  return result;
}

export async function provisionCustomerAccess(id: string): Promise<Customer> {
  const result = await restRequest<Customer>(`/api/customers/${id}/provision-access`, { method: 'POST' });
  invalidate('customers');
  return result;
}

export async function rejectCustomer(id: string): Promise<Customer> {
  const result = await restRequest<Customer>(`/api/customers/${id}/reject`, {
    method: 'PATCH',
  });
  invalidate('customers');
  return result;
}

export async function deleteCustomer(id: string): Promise<void> {
  await restRequest<void>(`/api/customers/${id}`, { method: 'DELETE' });
  invalidate('customers');
}
