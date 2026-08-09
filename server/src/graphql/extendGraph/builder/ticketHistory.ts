import {
  listTicketHistory,
  listTicketHistoryByTicket,
  createTicketHistoryEntry,
} from "../../../modules/ticket/ticket-history.service.js";
import type { Context } from "../.././../servers/context.js";

export const typeDefs = `
  type TicketHistory {
    id: String!
    ticketId: String
    status: String
    remarks: String
    author: String
    createdAt: String
  }

  input CreateTicketHistoryInput {
    ticketId: String!
    status: String
    remarks: String
    author: String
  }

  extend type Query {
    ticketHistory: [TicketHistory]
    ticketHistoryByTicket(ticketId: String!): [TicketHistory]
  }

  extend type Mutation {
    createTicketHistory(input: CreateTicketHistoryInput!): TicketHistory
  }
`;

export const resolvers = {
  TicketHistory: {
    createdAt: (obj: any) => obj.createdAt?.toISOString() ?? null,
  },
  Query: {
    ticketHistory: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listTicketHistory();
    },
    ticketHistoryByTicket: async (
      _: unknown,
      { ticketId }: { ticketId: string },
      ctx: Context,
    ) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listTicketHistoryByTicket(ticketId);
    },
  },
  Mutation: {
    createTicketHistory: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return createTicketHistoryEntry(input);
    },
  },
};
