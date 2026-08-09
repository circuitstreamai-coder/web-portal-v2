import type { FastifyInstance } from "fastify";
import { saveOtp, verifyOtp } from "./otp-store.js";
import { isEmailAvailable } from "../onboarding/onboarding.service.js";
import { sendEmail, otpEmail } from "../../services/email.js";
import { checkRateLimit, normalizeIdentity } from "../../utils/request-limiter.js";

type OtpFlow = "customer" | "engineer";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function otpRoutes(app: FastifyInstance) {
  app.post<{ Body: { email?: string; flow?: OtpFlow } }>("/api/otp/send", async (req, reply) => {
    const { email, flow } = req.body ?? {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ message: "Invalid email address." });
    }

    if (flow !== "customer" && flow !== "engineer") {
      return reply.code(400).send({ message: "Invalid OTP request." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const ip = normalizeIdentity(req.ip);

    const ipLimit = checkRateLimit(`otp:ip:${ip}`, { windowMs: 60_000, maxHits: 10 });
    if (!ipLimit.allowed) {
      reply.header("Retry-After", String(Math.ceil(ipLimit.retryAfterMs / 1000)));
      return reply.code(429).send({ message: "Too many OTP requests. Please wait and try again." });
    }

    const emailLimit = checkRateLimit(`otp:email:${normalizedEmail}`, {
      windowMs: 10 * 60_000,
      maxHits: 5,
    });
    if (!emailLimit.allowed) {
      reply.header("Retry-After", String(Math.ceil(emailLimit.retryAfterMs / 1000)));
      return reply.code(429).send({ message: "Too many OTP requests for this email. Please try again later." });
    }

    const available = await isEmailAvailable(normalizedEmail);
    if (!available) {
      return reply.code(409).send({ message: "Email ID already exists." });
    }

    const otp = generateOtp();
    saveOtp(normalizedEmail, otp);

    try {
      await sendEmail({ to: normalizedEmail, ...otpEmail(otp) });
    } catch (err) {
      console.error("[otp/send] email send failed:", err);
      return reply.code(500).send({ message: "Failed to send OTP email. Please try again." });
    }

    return reply.send({ message: "OTP sent." });
  });

  app.post<{ Body: { email?: string; otp?: string } }>("/api/otp/verify", async (req, reply) => {
    const { email, otp } = req.body ?? {};

    if (!email || !otp) {
      return reply.code(400).send({ message: "Email and OTP are required." });
    }

    const valid = verifyOtp(email, otp);
    if (!valid) {
      return reply.code(400).send({ message: "Invalid or expired OTP." });
    }

    return reply.send({ message: "Verified." });
  });
}
