import {
  listAttachments,
  listAttachmentsByTicket,
  createAttachment,
} from "../../../modules/ticket/attachment.service.js";
import type { Context } from "../.././../servers/context.js";

export const typeDefs = `
  type Attachment {
    id: String!
    ticketId: String
    type: String
    fileUrl: String
    uploadedAt: String
    uploadedBy: String
    author: String
    createdAt: String
  }

  input CreateAttachmentInput {
    ticketId: String!
    type: String
    fileUrl: String
    uploadedBy: String
  }

  extend type Query {
    attachments: [Attachment]
    attachmentsByTicket(ticketId: String!): [Attachment]
  }

  extend type Mutation {
    createAttachment(input: CreateAttachmentInput!): Attachment
  }
`;

export const resolvers = {
  Attachment: {
    createdAt: (obj: any) => obj.createdAt?.toISOString() ?? null,
    uploadedAt: (obj: any) => obj.uploadedAt?.toISOString() ?? null,
  },
  Query: {
    attachments: async (_: unknown, __: unknown, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listAttachments();
    },
    attachmentsByTicket: async (
      _: unknown,
      { ticketId }: { ticketId: string },
      ctx: Context,
    ) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      return listAttachmentsByTicket(ticketId);
    },
  },
  Mutation: {
    createAttachment: async (_: unknown, { input }: { input: any }, ctx: Context) => {
      if (!ctx.user) throw { statusCode: 401, message: "Unauthorized" };
      const { ticketId, uploadedBy, ...attachmentInput } = input;
      return createAttachment(
        ticketId,
        attachmentInput,
        uploadedBy ?? "system",
      );
    },
  },
};
