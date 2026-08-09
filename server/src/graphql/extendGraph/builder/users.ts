import {
  listUsers,
  createUser,
  updateUserStatus,
} from "../../../modules/auth/user.service.js";
import type { Context } from "../../../servers/context.js";

export const typeDefs = `
  type User {
    id: String!
    name: String
    email: String
    phone: String
    status: String
    role: String
    approvedBy: String
    approvedAt: String
    author: String
    createdAt: String
  }

  input CreateUserInput {
    name: String
    email: String
    phone: String
    password: String
    status: String
    author: String
  }

  input UpdateUserStatusInput {
    id: String!
    status: String!
    approvedBy: String
  }

  extend type Query {
    users(role: String): [User]
  }

  extend type Mutation {
    createUser(input: CreateUserInput!): User
    updateUserStatus(input: UpdateUserStatusInput!): User
  }
`;

export const resolvers = {
  User: {
    createdAt: (obj: any) => obj.createdAt?.toISOString() ?? null,
    approvedAt: (obj: any) => obj.approvedAt?.toISOString() ?? null,
  },
  Query: {
    users: async (_: unknown, { role }: { role?: string }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listUsers(role);
    },
  },
  Mutation: {
    createUser: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return createUser(input);
    },
    updateUserStatus: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return updateUserStatus(input.id, input.status, input.approvedBy);
    },
  },
};
