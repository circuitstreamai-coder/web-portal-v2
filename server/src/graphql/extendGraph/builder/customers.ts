import {
  listCustomers,
  createCustomerDirect,
  setCustomerStatus,
} from "../../../modules/customer/customer.service.js";
import type { Context } from "../../../servers/context.js";

export const typeDefs = `
  type Customer {
    id: String!
    companyName: String
    contactPersonName: String
    email: String
    phone: String
    secondaryContactName: String
    secondaryContactEmail: String
    secondaryContactPhone: String
    addressState: String
    addressCity: String
    addressPincode: String
    referenceId: String
    userId: String
    status: String
    approvedBy: String
    approvedAt: String
    author: String
    createdAt: String
  }

  input CreateCustomerInput {
    companyName: String
    contactPersonName: String
    email: String
    phone: String
    secondaryContactName: String
    secondaryContactEmail: String
    secondaryContactPhone: String
    addressState: String
    addressCity: String
    addressPincode: String
    userId: String
    author: String
  }

  input UpdateCustomerStatusInput {
    id: String!
    status: String!
    approvedBy: String
  }

  extend type Query {
    customers: [Customer]
  }

  extend type Mutation {
    createCustomer(input: CreateCustomerInput!): Customer
    updateCustomerStatus(input: UpdateCustomerStatusInput!): Customer
  }
`;

export const resolvers = {
  Customer: {
    createdAt: (obj: any) => obj.createdAt?.toISOString() ?? null,
    approvedAt: (obj: any) => obj.approvedAt?.toISOString() ?? null,
  },
  Query: {
    customers: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listCustomers(ctx.user.role, ctx.user.id);
    },
  },
  Mutation: {
    createCustomer: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return createCustomerDirect(input);
    },
    updateCustomerStatus: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      if (ctx.user.role !== "super_admin") throw { statusCode: 403, message: "Forbidden" };
      return setCustomerStatus(input.id, input.status, input.approvedBy);
    },
  },
};
