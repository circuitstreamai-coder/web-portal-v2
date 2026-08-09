import {
  listRoles,
  createRole,
} from "../../../modules/auth/role.service.js";
import type { Context } from "../.././../servers/context.js";

export const typeDefs = `
  type Role {
    id: String!
    name: String!
    author: String
    createdAt: String
  }

  input CreateRoleInput {
    name: String!
    author: String
  }

  extend type Query {
    roles: [Role]
  }

  extend type Mutation {
    createRole(input: CreateRoleInput!): Role
  }
`;

export const resolvers = {
  Query: {
    roles: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listRoles();
    },
  },
  Mutation: {
    createRole: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (ctx.user?.role !== "super_admin") throw { statusCode: 403, message: "Forbidden" };
      return createRole(input);
    },
  },
};
