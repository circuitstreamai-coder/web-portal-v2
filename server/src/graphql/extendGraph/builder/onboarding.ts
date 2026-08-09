import {
  submitEngineerOnboarding,
  submitCustomerOnboarding,
  bulkCreateEngineers,
  isEmailAvailable,
} from "../../../modules/onboarding/onboarding.service.js";
import type { Context } from "../../../servers/context.js";

export const typeDefs = `
  type OnboardingResult {
    id: String!
    referenceId: String!
    status: String!
    createdAt: String!
  }

  input EngineerOnboardingInput {
    fullName: String!
    phone: String!
    email: String!
    state: String!
    city: String!
    pincode: String!
    profilePhotoId: Int
    aadhaarFrontId: Int!
    aadhaarBackId: Int!
    panFileId: Int!
    dlFrontId: Int!
    dlBackId: Int!
    accountHolderName: String!
    accountNumber: String!
    ifsc: String!
    cancelChequeFileId: Int!
  }

  input CustomerOnboardingInput {
    customerName: String!
    companyName: String!
    contactPersonName: String!
    email: String!
    phone: String!
    state: String!
    city: String!
    pincode: String!
    secondaryName: String
    secondaryEmail: String
    secondaryPhone: String
  }

  input BulkEngineerInput {
    fullName: String!
    email: String!
    phone: String!
    state: String!
    city: String!
    pincode: String!
    accountHolderName: String
    accountNumber: String
    ifsc: String
  }

  type BulkEngineerSuccess {
    id: String!
    referenceId: String!
    email: String!
  }

  type BulkEngineerError {
    row: Int!
    email: String
    reason: String!
  }

  type BulkCreateEngineersResult {
    success: [BulkEngineerSuccess!]!
    failed: [BulkEngineerError!]!
  }

  extend type Query {
    isEmailAvailable(email: String!): Boolean!
  }

  extend type Mutation {
    submitEngineerOnboarding(input: EngineerOnboardingInput!): OnboardingResult!
    submitCustomerOnboarding(input: CustomerOnboardingInput!): OnboardingResult!
    bulkCreateEngineers(engineers: [BulkEngineerInput!]!): BulkCreateEngineersResult!
  }
`;

export const resolvers = {
  Query: {
    isEmailAvailable: async (_: unknown, { email }: { email: string }) =>
      isEmailAvailable(email),
  },
  Mutation: {
    submitEngineerOnboarding: async (
      _: unknown,
      { input }: { input: any },
    ) => submitEngineerOnboarding(input),
    submitCustomerOnboarding: async (
      _: unknown,
      { input }: { input: any },
    ) => submitCustomerOnboarding(input),
    bulkCreateEngineers: async (
      _: unknown,
      { engineers }: { engineers: any[] },
      ctx: Context,
    ) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return bulkCreateEngineers(engineers);
    },
  },
};
