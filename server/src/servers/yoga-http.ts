import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { createYoga } from "graphql-yoga";
import { schema } from "../graphql/index.js";
import { uploadFile, getFile, canAccessFile } from "../modules/files/file.service.js";
import { jwtPlugin } from "../plugins/jwt.js";
import { authenticate } from "../plugins/authMiddleware.js";
import { listPayoutRates } from "../modules/ticket/ticket-category.service.js";
import { adminRoutes } from "../modules/admin/admin.routes.js";
import { authRoutes } from "../modules/auth/auth.routes.js";
import { customerRoutes } from "../modules/customer/customer.routes.js";
import { projectRoutes } from "../modules/project/project.routes.js";
import { ticketRoutes } from "../modules/ticket/ticket.routes.js";
import { engineerProfileRoutes } from "../modules/engineer-profile/engineer-profile.routes.js";
import { engineerAvailabilityRoutes } from "../modules/engineer-availability/engineer-availability.routes.js";
import { userRoutes } from "../modules/auth/user.routes.js";
import { inventoryRoutes } from "../modules/inventory/inventory.routes.js";
import { emailSecurityRoutes } from "../modules/email-security/email-security.routes.js";
import { notificationRoutes } from "../modules/notifications/notification.routes.js";
import { otpRoutes } from "../modules/otp/otp.routes.js";
import { checkEmailRoutes } from "../modules/check-email/check-email.routes.js";
import { seedUsers } from "../db/seed.js";
import { COOKIE_NAME } from "../modules/auth/auth.schema.js";
import type { JwtPayload } from "../modules/auth/auth.schema.js";
import { pool } from "../db/index.js";
import { isEmailConfigured } from "../services/email.js";

export async function createServer() {
  const app = Fastify({ logger: true });

  // ── Plugins ───────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });

  await app.register(jwtPlugin);
  await app.register(multipart);

  // Vite's dev proxy can alter multipart body bytes while keeping the original
  // Content-Length, causing FST_ERR_CTP_INVALID_CONTENT_LENGTH. Dropping the
  // header for multipart requests lets Fastify skip the length validation.
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (request.headers["content-type"]?.startsWith("multipart/form-data")) {
      delete request.headers["content-length"];
    }
    return payload;
  });

  // ── REST routes ───────────────────────────────────────────────────────────
  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(customerRoutes);
  await app.register(projectRoutes);
  await app.register(ticketRoutes);
  await app.register(engineerProfileRoutes);
  await app.register(engineerAvailabilityRoutes);
  await app.register(userRoutes);
  await app.register(inventoryRoutes);
  await app.register(emailSecurityRoutes);
  await app.register(notificationRoutes);
  await app.register(otpRoutes);
  await app.register(checkEmailRoutes);
  app.get("/api/payout-rates", { preHandler: [authenticate] }, async (_req, reply) => {
    try {
      return reply.send(await listPayoutRates());
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  app.get("/health", async () => {
    return {
      ok: true,
      service: "innoserve-api-test",
    };
  });

  app.get("/ready", async (_request, reply) => {
    try {
      await pool.query("select 1");
      if (!isEmailConfigured()) throw new Error("Email provider is not configured");

      return { ok: true, service: "innoserve-api-test" };
    } catch (err) {
      app.log.error({ err }, "Readiness check failed");
      return reply.code(503).send({ ok: false, service: "innoserve-api-test" });
    }
  });

  // ── Dev routes (non-production only) ─────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/dev/seed-users", async (_req, reply) => {
      const result = await seedUsers();
      return reply.send(result);
    });
  }

  // ── File upload ───────────────────────────────────────────────────────────
  // Public — required for unauthenticated onboarding KYC uploads.
  // Guarded by MIME type allowlist and 10 MB size cap to limit abuse.
  const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg", "image/png", "image/webp", "application/pdf",
  ]);
  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

  app.post("/upload", async (req, reply) => {
    const upload = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    if (!upload) return reply.status(400).send({ error: "No file provided" });

    if (!ALLOWED_MIME_TYPES.has(upload.mimetype)) {
      return reply.status(415).send({ error: "Only JPEG, PNG, WebP, and PDF files are allowed" });
    }

    const rawChunks: Buffer[] = [];
    for await (const chunk of upload.file) {
      rawChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const data = Buffer.concat(rawChunks);

    if (upload.file.truncated) {
      return reply.status(413).send({ error: "File exceeds the 10 MB limit" });
    }

    return uploadFile({ filename: upload.filename, mimetype: upload.mimetype, data });
  });

  // ── File serving ──────────────────────────────────────────────────────────
  app.get("/file/:id", async (req, reply) => {
    try {
      await req.jwtVerify({ onlyCookie: true });
    } catch {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const id = parseInt((req.params as { id: string }).id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Invalid file id" });

    const user = req.user as JwtPayload;
    const allowed = await canAccessFile(id, user.id, user.role);
    if (!allowed) return reply.status(403).send({ error: "Forbidden" });

    try {
      const { file, data } = await getFile(id);
      reply.header("Content-Type", file.mimeType);
      reply.header("Content-Disposition", `inline; filename="${file.filename}"`);
      reply.header("Cache-Control", "private, max-age=86400");
      return reply.send(data);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  // ── GraphQL ───────────────────────────────────────────────────────────────
  const yoga = createYoga({
    schema,
    logging: false,
    maskedErrors: false,
    context: (yogaCtx) => {
      let user: JwtPayload | null = null;
      try {
        const cookieHeader = yogaCtx.request.headers.get("cookie");
        if (cookieHeader) {
          const token = parseCookieToken(cookieHeader, COOKIE_NAME);
          if (token) {
            user = app.jwt.verify<JwtPayload>(token);
          }
        }
      } catch {
        // unauthenticated request — user stays null
      }
      return { user };
    },
  });

  app.route({
    url: "/graphql",
    method: ["GET", "POST", "OPTIONS"],
    handler: async (req, reply) => {
      const response = await yoga.handleNodeRequestAndResponse(req, reply);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.status(response.status);
      reply.send(response.body);
      return reply;
    },
  });

  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCookieToken(cookieHeader: string, name: string): string | null {
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
