import { restRequest } from "$lib/api/rest";
import { invalidate } from "$lib/stores/query";
import type { EngineerProfile } from "./queries";

// ── Input Types ─────────────────────────────────────────────────────────────

export interface UpdateEngineerDocumentsStatusInput {
  id: string;
  documentsStatus: string;
}

export interface UpdateEngineerInput {
  id: string;
  userName?: string;
  userPhone?: string;
  addressState?: string;
  addressCity?: string;
  addressPincode?: string;
  assignedState?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
}

// ── Functions ──────────────────────────────────────────────────────────────

export async function updateEngineerDocumentsStatus(
  input: UpdateEngineerDocumentsStatusInput,
): Promise<EngineerProfile> {
  const { id, ...body } = input;
  const result = await restRequest<EngineerProfile>(
    `/api/engineer-profiles/${id}/documents-status`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  invalidate('engineers');
  return result;
}

export async function updateEngineer(input: UpdateEngineerInput): Promise<EngineerProfile> {
  const { id, ...body } = input;
  const result = await restRequest<EngineerProfile>(
    `/api/engineer-profiles/${id}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  invalidate('engineers');
  return result;
}

export async function updateEngineerAccountStatus(id: string, accountStatus: string): Promise<EngineerProfile> {
  const result = await restRequest<EngineerProfile>(
    `/api/engineer-profiles/${id}/account-status`,
    { method: 'PATCH', body: JSON.stringify({ accountStatus }) },
  );
  invalidate('engineers');
  return result;
}

export async function deleteEngineer(id: string): Promise<void> {
  await restRequest<void>(`/api/engineer-profiles/${id}`, { method: 'DELETE' });
  invalidate('engineers');
}
