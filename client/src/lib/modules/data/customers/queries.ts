import { gqlRequest } from "$lib/api/graphql";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  companyName: string;
  contactPersonName: string;
  email: string;
  phone: string;
  secondaryContactName: string | null;
  secondaryContactEmail: string | null;
  secondaryContactPhone: string | null;
  addressState: string | null;
  addressCity: string | null;
  addressPincode: string | null;
  userId: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  author: string | null;
  createdAt: string;
}

// ── Queries ────────────────────────────────────────────────────────────────

const FETCH_CUSTOMERS = `
  query {
    customers {
      id companyName contactPersonName email phone
      secondaryContactName secondaryContactEmail secondaryContactPhone
      addressState addressCity addressPincode
      userId status approvedBy approvedAt author createdAt
    }
  }
`;

// ── Functions ──────────────────────────────────────────────────────────────

export async function fetchCustomers(): Promise<Customer[]> {
  const data = await gqlRequest<{ customers: Customer[] }>(FETCH_CUSTOMERS);
  return data.customers;
}
