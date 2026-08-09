import {
  listEngineerProfilesWithUsers,
  getEngineerProfileByUserId,
  createEngineerProfile,
  updateEngineerDocumentUrls,
  updateDocumentsStatus,
} from "../../../modules/engineer-profile/engineer-profile.service.js";
import type { Context } from "../../../servers/context.js";

export const typeDefs = `
  type EngineerProfile {
    id: String!
    userId: String!
    referenceId: String
    userName: String
    userEmail: String
    userPhone: String
    addressState: String
    addressCity: String
    addressPincode: String
    assignedState: String
    profilePhotoUrl: String
    aadhaarFrontUrl: String
    aadhaarBackUrl: String
    panCardUrl: String
    dlFrontUrl: String
    dlBackUrl: String
    documentsStatus: String
    accountStatus: String
    bankAccountNumber: String
    ifscCode: String
    accountHolderName: String
    cancelChequeUrl: String
    author: String
    createdAt: String
  }

  input CreateEngineerProfileInput {
    userId: String!
    addressState: String
    addressCity: String
    addressPincode: String
    assignedState: String
    profilePhotoUrl: String
    aadhaarFrontUrl: String
    aadhaarBackUrl: String
    panCardUrl: String
    dlFrontUrl: String
    dlBackUrl: String
    bankAccountNumber: String
    ifscCode: String
    accountHolderName: String
    cancelChequeUrl: String
    author: String
  }

  input UpdateEngineerDocumentsInput {
    id: String!
    aadhaarFrontUrl: String
    aadhaarBackUrl: String
    panCardUrl: String
    dlFrontUrl: String
    dlBackUrl: String
    cancelChequeUrl: String
    profilePhotoUrl: String
  }

  input UpdateEngineerDocumentsStatusInput {
    id: String!
    documentsStatus: String!
  }

  extend type Query {
    engineerProfiles: [EngineerProfile]
    engineerProfile(userId: String!): EngineerProfile
  }

  extend type Mutation {
    createEngineerProfile(input: CreateEngineerProfileInput!): EngineerProfile
    updateEngineerDocuments(input: UpdateEngineerDocumentsInput!): EngineerProfile
    updateEngineerDocumentsStatus(input: UpdateEngineerDocumentsStatusInput!): EngineerProfile
  }
`;

export const resolvers = {
  EngineerProfile: {
    createdAt: (obj: any) => obj.createdAt?.toISOString() ?? null,
    accountStatus: (obj: any) => (obj.userStatus === "inactive" ? "suspended" : "active"),
  },
  Query: {
    engineerProfiles: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listEngineerProfilesWithUsers();
    },
    engineerProfile: async (_: unknown, { userId }: { userId: string }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return getEngineerProfileByUserId(userId);
    },
  },
  Mutation: {
    createEngineerProfile: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return createEngineerProfile(input);
    },
    updateEngineerDocuments: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      if (!["super_admin", "noc"].includes(ctx.user.role)) {
        throw { statusCode: 403, message: "Forbidden" };
      }
      const { id, ...fields } = input;
      return updateEngineerDocumentUrls(id, fields);
    },
    updateEngineerDocumentsStatus: async (
      _: unknown,
      { input }: { input: any },
      ctx: Context,
    ) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      if (!["super_admin", "noc"].includes(ctx.user.role)) {
        throw { statusCode: 403, message: "Forbidden" };
      }
      return updateDocumentsStatus(input.id, input.documentsStatus);
    },
  },
};
