import type { FastifyInstance } from "fastify";
import { deleteOtp, saveOtp, verifyOtp, type OtpFlow } from "./otp-store.js";
import { createEmailVerificationProof } from "./verification-proof.js";
import { isEmailAvailable } from "../onboarding/onboarding.service.js";
import { sendEmail, otpEmail } from "../../services/email.js";
import { checkRateLimit, normalizeIdentity } from "../../utils/request-limiter.js";

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
    try {
      await saveOtp(normalizedEmail, otp, flow);
      await sendEmail({ to: normalizedEmail, ...otpEmail(otp) });
    } catch (err) {
      console.error("[otp/send] OTP delivery failed:", err);
      await deleteOtp(normalizedEmail, otp).catch((cleanupError) => {
        console.error("[otp/send] OTP cleanup failed:", cleanupError);
      });
      return reply.code(500).send({ message: "Failed to send OTP email. Please try again." });
    }

    return reply.send({ message: "OTP sent." });
  });

  app.post<{ Body: { email?: string; otp?: string } }>("/api/otp/verify", async (req, reply) => {
    const { email, otp } = req.body ?? {};

    if (!email || !otp) {
      return reply.code(400).send({ message: "Email and OTP are required." });
    }

    const flow = await verifyOtp(email, otp);
    if (!flow) {
      return reply.code(400).send({ message: "Invalid or expired OTP." });
    }

    return reply.send({
      message: "Verified.",
      verificationToken: createEmailVerificationProof(email, flow),
    });
  });
}
