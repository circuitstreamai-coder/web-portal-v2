import {
  listTicketCategories,
  createTicketCategory,
} from "../../../modules/ticket/ticket-category.service.js";
import type { Context } from "../.././../servers/context.js";

export const typeDefs = `
  type TicketCategory {
    id: String!
    name: String
    defaultPayout: Int
    author: String
    createdAt: String
  }

  input CreateTicketCategoryInput {
    name: String
    defaultPayout: Int
    author: String
  }

  extend type Query {
    ticketCategories: [TicketCategory]
  }

  extend type Mutation {
    createTicketCategory(input: CreateTicketCategoryInput!): TicketCategory
  }
`;

export const resolvers = {
  TicketCategory: {
    createdAt: (obj: any) => obj.createdAt?.toISOString() ?? null,
  },
  Query: {
    ticketCategories: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listTicketCategories();
    },
  },
  Mutation: {
    createTicketCategory: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (ctx.user?.role !== "super_admin") throw { statusCode: 403, message: "Forbidden" };
      return createTicketCategory(input);
    },
  },
};
