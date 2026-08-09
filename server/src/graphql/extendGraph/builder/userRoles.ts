import {
  listUserRoles,
  createUserRole,
} from "../../../modules/auth/role.service.js";
import type { Context } from "../../../servers/context.js";

export const typeDefs = `
  type UserRole {
    userId: String
    roleId: String
    author: String
    state: String
    createdAt: String
  }

  input CreateUserRoleInput {
    userId: String!
    roleId: String!
    author: String
    state: String
  }

  extend type Query {
    userRoles: [UserRole]
  }

  extend type Mutation {
    createUserRole(input: CreateUserRoleInput!): UserRole
  }
`;

export const resolvers = {
  Query: {
    userRoles: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      if (ctx.user.role !== "super_admin") throw { statusCode: 403, message: "Forbidden" };
      return listUserRoles();
    },
  },
  Mutation: {
    createUserRole: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      if (ctx.user.role !== "super_admin") throw { statusCode: 403, message: "Forbidden" };
      return createUserRole(input);
    },
  },
};
