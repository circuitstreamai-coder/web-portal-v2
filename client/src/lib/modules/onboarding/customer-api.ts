// ARCHITECTURE NOTE: submitCustomerOnboarding is a write operation via GraphQL
// mutation — a known exception to the "REST for actions" rule. The onboarding
// mutation bundles multiple domain objects server-side; no REST equivalent exists.

import { gqlRequest } from "$lib/api/graphql";

// ── Input shape (mirrors the frontend form) ─────────────────────────────────

export interface CustomerOnboardingFormData {
  // Business Details
  customerName: string;
  companyName: string;
  contactPersonName: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  pincode: string;

  // Secondary Contact (all optional)
  secondaryName?: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
}

// ── GraphQL input / response types ──────────────────────────────────────────

export interface CustomerOnboardingInput {
  customerName: string;
  companyName: string;
  contactPersonName: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  pincode: string;
  secondaryName?: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
}

export interface CustomerOnboardingResult {
  id: string;
  referenceId: string;
  status: string;
  createdAt: string;
}

// ── Mutation ─────────────────────────────────────────────────────────────────

const SUBMIT_CUSTOMER_ONBOARDING = `
  mutation SubmitCustomerOnboarding($input: CustomerOnboardingInput!) {
    submitCustomerOnboarding(input: $input) {
      id
      referenceId
      status
      createdAt
    }
  }
`;

// ── Main function ────────────────────────────────────────────────────────────
//
// Flow:
//   1. Build the GraphQL input from form data
//   2. Run the mutation → return { id, referenceId, status, createdAt }
//   No file uploads needed for customer onboarding.

export async function submitCustomerOnboarding(
  formData: CustomerOnboardingFormData,
): Promise<CustomerOnboardingResult> {
  const input: CustomerOnboardingInput = {
    customerName: formData.customerName,
    companyName: formData.companyName,
    contactPersonName: formData.contactPersonName,
    email: formData.email,
    phone: formData.phone,
    state: formData.state,
    city: formData.city,
    pincode: formData.pincode,
    // Include secondary contact only if provided
    ...(formData.secondaryName ? { secondaryName: formData.secondaryName } : {}),
    ...(formData.secondaryEmail ? { secondaryEmail: formData.secondaryEmail } : {}),
    ...(formData.secondaryPhone ? { secondaryPhone: formData.secondaryPhone } : {}),
  };

  const data = await gqlRequest<{ submitCustomerOnboarding: CustomerOnboardingResult }>(
    SUBMIT_CUSTOMER_ONBOARDING,
    { input },
  );

  return data.submitCustomerOnboarding;
}
