import type { FastifyRequest, FastifyReply } from "fastify";
import {
  loginUser,
  getCurrentUser,
  changeUserPassword,
  sendForgotPasswordEmail,
  resetUserPassword,
} from "./auth.service.js";
import {
  COOKIE_NAME,
  COOKIE_OPTIONS,
  roleCookieName,
  type LoginBody,
  type ChangePasswordBody,
  type ForgotPasswordBody,
  type ResetPasswordBody,
} from "./auth.schema.js";
import { checkRateLimit, normalizeIdentity } from "../../utils/request-limiter.js";

function getRetryAfterSeconds(retryAfterMs: number) {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
}

function getAuthIdentity(req: FastifyRequest, email?: string) {
  return {
    ip: normalizeIdentity(req.ip),
    email: normalizeIdentity(email),
  };
}

function isRateLimited(
  reply: FastifyReply,
  limits: Array<{ key: string; windowMs: number; maxHits: number }>,
  message: string,
  statusCode = 429,
) {
  for (const limit of limits) {
    const result = checkRateLimit(limit.key, {
      windowMs: limit.windowMs,
      maxHits: limit.maxHits,
    });
    if (!result.allowed) {
      reply.header("Retry-After", getRetryAfterSeconds(result.retryAfterMs));
      reply.code(statusCode).send(
        statusCode === 200 ? { success: true, message } : { error: message },
      );
      return true;
    }
  }

  return false;
}

export async function login(
  req: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply,
) {
  const { email, password } = req.body;

  if (!email || !password) {
    return reply.code(400).send({ error: "Email and password are required" });
  }

  const identity = getAuthIdentity(req, email);
  if (
    isRateLimited(
      reply,
      [
        { key: `auth:login:ip:${identity.ip}`, windowMs: 60_000, maxHits: 30 },
        { key: `auth:login:email:${identity.email}`, windowMs: 10 * 60_000, maxHits: 10 },
      ],
      "Too many login attempts. Please wait and try again.",
    )
  ) {
    return;
  }

  try {
    const { user, jwtPayload } = await loginUser(email, password);
    const token = req.server.jwt.sign(jwtPayload, { expiresIn: "7d" });

    const sessionRole = ["engineer", "l2_engineer", "l3_engineer"].includes(user.role)
      ? "engineer"
      : user.role;

    return reply
      .setCookie(COOKIE_NAME, token, COOKIE_OPTIONS)
      .setCookie(roleCookieName(user.role), token, COOKIE_OPTIONS)
      .setCookie(roleCookieName(sessionRole), token, COOKIE_OPTIONS)
      .send({ user });
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function logout(req: FastifyRequest, reply: FastifyReply) {
  const requestedRole = typeof req.headers["x-portal-role"] === "string"
    ? req.headers["x-portal-role"]
    : undefined;
  if (requestedRole) reply.clearCookie(roleCookieName(requestedRole), { path: "/" });
  return reply.clearCookie(COOKIE_NAME, { path: "/" }).send({ success: true });
}

export async function changePassword(
  req: FastifyRequest<{ Body: ChangePasswordBody }>,
  reply: FastifyReply,
) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return reply.code(400).send({ error: "currentPassword and newPassword are required" });
  }

  try {
    await changeUserPassword(req.user.id, currentPassword, newPassword);
    return reply.send({ success: true });
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function getMe(req: FastifyRequest, reply: FastifyReply) {
  try {
    const user = await getCurrentUser(req.user.id);
    return reply.send({ user });
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function forgotPassword(
  req: FastifyRequest<{ Body: ForgotPasswordBody }>,
  reply: FastifyReply,
) {
  const { email } = req.body;

  if (!email) {
    return reply.code(400).send({ error: "email is required" });
  }

  const identity = getAuthIdentity(req, email);
  if (
    isRateLimited(
      reply,
      [
        { key: `auth:forgot:ip:${identity.ip}`, windowMs: 15 * 60_000, maxHits: 25 },
        { key: `auth:forgot:email:${identity.email}`, windowMs: 30 * 60_000, maxHits: 6 },
      ],
      "If an active account exists for this email, a reset link has been sent.",
      200,
    )
  ) {
    return;
  }

  try {
    await sendForgotPasswordEmail(email, (payload) =>
      req.server.jwt.sign(payload, { expiresIn: "1h" }),
    );
    return reply.send({
      success: true,
      message: "If an active account exists for this email, a reset link has been sent.",
    });
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}

export async function resetPassword(
  req: FastifyRequest<{ Body: ResetPasswordBody }>,
  reply: FastifyReply,
) {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return reply.code(400).send({ error: "token and newPassword are required" });
  }

  try {
    await resetUserPassword(token, newPassword, (value) =>
      req.server.jwt.verify<{ id: string; email: string; role?: string; purpose?: string }>(value),
    );
    return reply.send({ success: true });
  } catch (err: any) {
    return reply
      .code(err.statusCode ?? 500)
      .send({ error: err.message ?? "Internal server error" });
  }
}
