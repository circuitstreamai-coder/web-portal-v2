import {
  listProjects,
  createProject,
} from "../../../modules/project/project.service.js";
import type { Context } from "../.././../servers/context.js";

export const typeDefs = `
  type Project {
    id: String!
    name: String
    customerId: String
    projectHeadId: String
  }

  input CreateProjectInput {
    customerId: String
    projectHeadId: String
    name: String
    author: String
  }

  extend type Query {
    projects: [Project]
  }

  extend type Mutation {
    createProject(input: CreateProjectInput!): Project
  }
`;

export const resolvers = {
  Query: {
    projects: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listProjects(ctx.user.role, ctx.user.id);
    },
  },
  Mutation: {
    createProject: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return createProject(input);
    },
  },
};
