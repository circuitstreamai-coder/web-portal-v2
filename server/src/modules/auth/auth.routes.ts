import type { FastifyInstance } from "fastify";
import {
  login,
  logout,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
} from "./auth.controller.js";
import type {
  ChangePasswordBody,
  LoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
} from "./auth.schema.js";
import { authenticate } from "../../plugins/authMiddleware.js";

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login — public
  app.post<{ Body: LoginBody }>("/api/auth/login", login);

  // POST /api/auth/logout — public (clears cookie regardless)
  app.post("/api/auth/logout", logout);

  // POST /api/auth/forgot-password — public
  app.post<{ Body: ForgotPasswordBody }>("/api/auth/forgot-password", forgotPassword);

  // POST /api/auth/reset-password — public
  app.post<{ Body: ResetPasswordBody }>("/api/auth/reset-password", resetPassword);

  // GET /api/auth/me — requires valid JWT cookie
  app.get("/api/auth/me", { preHandler: [authenticate] }, getMe);

  // POST /api/auth/change-password — requires valid JWT cookie
  app.post<{ Body: ChangePasswordBody }>(
    "/api/auth/change-password",
    { preHandler: [authenticate] },
    changePassword,
  );
}
