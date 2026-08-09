import {
  listTickets,
  createTicket,
} from "../../../modules/ticket/ticket.service.js";
import type { Context } from "../../../servers/context.js";

export const typeDefs = `
  type Ticket {
    id: String!
    ticketNumber: String
    projectId: String
    categoryId: String
    title: String
    description: String
    priority: String
    status: String
    state: String
    city: String
    pincode: String
    address: String
    assignedEngineerId: String
    assignedStatePlannerId: String
    statePlannerId: String
    escalationLevel: String
    payoutAmount: Int
    slaDeadline: String
    closedAt: String
    author: String
    createdAt: String
  }

  input CreateTicketInput {
    ticketNumber: String
    projectId: String
    categoryId: String
    title: String
    description: String
    priority: String
    status: String
    state: String
    city: String
    pincode: String
    address: String
    assignedEngineerId: String
    assignedStatePlannerId: String
    escalationLevel: String
    payoutAmount: Int
    slaDeadline: String
    author: String
  }

  extend type Query {
    tickets: [Ticket]
  }

  extend type Mutation {
    createTicket(input: CreateTicketInput!): Ticket
  }
`;

export const resolvers = {
  Query: {
    tickets: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      const rows = await listTickets(ctx.user.role, ctx.user.id);
      return rows.map((r) => ({
        ...r,
        statePlannerId: r.assignedStatePlannerId,
        createdAt: r.createdAt?.toISOString() ?? null,
        slaDeadline: r.slaDeadline?.toISOString() ?? null,
        closedAt: r.closedAt?.toISOString() ?? null,
      }));
    },
  },
  Mutation: {
    createTicket: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      const authorId = ctx.user.id;
      const role = ctx.user.role;
      const userId = ctx.user.id;
      const ticket = await createTicket(input, authorId, role, userId);
      return {
        ...ticket,
        statePlannerId: ticket.assignedStatePlannerId,
        createdAt: ticket.createdAt?.toISOString() ?? null,
        slaDeadline: ticket.slaDeadline?.toISOString() ?? null,
        closedAt: ticket.closedAt?.toISOString() ?? null,
      };
    },
  },
};
