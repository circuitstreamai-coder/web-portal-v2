// ARCHITECTURE NOTE: submitEngineerOnboarding is a write operation via GraphQL
// mutation — a known exception to the "REST for actions" rule. The backend
// mutation handles file-ID stitching + multi-table inserts atomically; no
// REST equivalent exists. Upload calls remain REST (/upload endpoint).

import { gqlRequest } from "$lib/api/graphql";
import { uploadFile } from "$lib/api/upload";

// ── Input shape (mirrors the frontend form) ─────────────────────────────────

export interface EngineerOnboardingFormData {
  // Basic Details
  fullName: string;
  phone: string;
  email: string;
  state: string;
  city: string;
  pincode: string;
  profilePhoto?: File;        // optional

  // KYC Documents (File objects from the form)
  aadhaarFront: File;
  aadhaarBack: File;
  panFile: File;
  dlFront: File;
  dlBack: File;

  // Bank Details
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  cancelChequeFile: File;
}

// ── GraphQL input / response types ──────────────────────────────────────────

export interface EngineerOnboardingInput {
  fullName: string;
  phone: string;
  email: string;
  state: string;
  city: string;
  pincode: string;
  profilePhotoId?: number;
  aadhaarFrontId: number;
  aadhaarBackId: number;
  panFileId: number;
  dlFrontId: number;
  dlBackId: number;
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  cancelChequeFileId: number;
}

export interface EngineerOnboardingResult {
  id: string;
  referenceId: string;
  status: string;
  createdAt: string;
}

// ── Mutation ─────────────────────────────────────────────────────────────────

const SUBMIT_ENGINEER_ONBOARDING = `
  mutation SubmitEngineerOnboarding($input: EngineerOnboardingInput!) {
    submitEngineerOnboarding(input: $input) {
      id
      referenceId
      status
      createdAt
    }
  }
`;
// NOTE: The backend GraphQL schema must accept aadhaarFrontId, aadhaarBackId,
// dlFrontId, dlBackId in place of the old aadhaarFileId / dlFileId fields.

// ── Main function ────────────────────────────────────────────────────────────
//
// Flow:
//   1. Upload each File object → receive fileId from server
//   2. Build the GraphQL input (text fields + fileIds)
//   3. Run the mutation → return { id, referenceId, status, createdAt }

export async function submitEngineerOnboarding(
  formData: EngineerOnboardingFormData,
): Promise<EngineerOnboardingResult> {
  // Upload all documents in parallel (profile photo is optional)
  const [aadhaarFrontId, aadhaarBackId, panFileId, dlFrontId, dlBackId, cancelChequeFileId, profilePhotoId] =
    await Promise.all([
      uploadFile(formData.aadhaarFront),
      uploadFile(formData.aadhaarBack),
      uploadFile(formData.panFile),
      uploadFile(formData.dlFront),
      uploadFile(formData.dlBack),
      uploadFile(formData.cancelChequeFile),
      formData.profilePhoto ? uploadFile(formData.profilePhoto) : Promise.resolve(undefined),
    ]);

  const input: EngineerOnboardingInput = {
    fullName: formData.fullName,
    phone: formData.phone,
    email: formData.email,
    state: formData.state,
    city: formData.city,
    pincode: formData.pincode,
    accountHolderName: formData.accountHolderName,
    accountNumber: formData.accountNumber,
    ifsc: formData.ifsc,
    aadhaarFrontId,
    aadhaarBackId,
    panFileId,
    dlFrontId,
    dlBackId,
    cancelChequeFileId,
    ...(profilePhotoId ? { profilePhotoId } : {}),
  };

  const data = await gqlRequest<{ submitEngineerOnboarding: EngineerOnboardingResult }>(
    SUBMIT_ENGINEER_ONBOARDING,
    { input },
  );

  return data.submitEngineerOnboarding;
}
