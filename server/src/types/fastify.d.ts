import type { JwtPayload } from "../modules/auth/auth.schema.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload;
  }
}
