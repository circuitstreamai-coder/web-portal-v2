import { createSchema } from "graphql-yoga";
import { builders } from "./extendGraph/index.js";
import type { Context } from "../servers/context.js";

const baseTypeDefs = `
  type Query {
    hello: String
  }

  type Mutation {
    _empty: String
  }
`;

const baseResolvers = {
  Query: {
    hello: () => "Ticket platform API running",
  },
};

export const schema = createSchema<Context>({
  typeDefs: [baseTypeDefs, ...builders.map((b) => b.typeDefs)],
  resolvers: [baseResolvers, ...builders.map((b) => b.resolvers)],
});
