import type { FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fp from "fastify-plugin";
import { COOKIE_NAME } from "../modules/auth/auth.schema.js";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export const jwtPlugin = fp(async function (app: FastifyInstance) {
  await app.register(fastifyCookie);

  await app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET as string,
    cookie: {
      cookieName: COOKIE_NAME,
      signed: false,
    },
  });
});
