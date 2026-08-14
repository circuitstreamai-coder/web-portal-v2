import { createHmac, timingSafeEqual } from "node:crypto";
import { pool } from "../../db/index.js";

export type OtpFlow = "customer" | "engineer";

type OtpRow = {
  otp_digest: string;
  expires_at: Date;
  attempts_remaining: number;
  flow: OtpFlow;
};

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeOtp(otp: string) {
  return otp.trim();
}

function getOtpHashSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

function otpDigest(email: string, otp: string) {
  return createHmac("sha256", getOtpHashSecret())
    .update(`${normalizeEmail(email)}:${normalizeOtp(otp)}`)
    .digest("hex");
}

export async function saveOtp(email: string, otp: string, flow: OtpFlow) {
  const normalizedEmail = normalizeEmail(email);
  await pool.query(
    `INSERT INTO portal.email_otp_challenges
       (email, otp_digest, flow, attempts_remaining, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (email) DO UPDATE SET
       otp_digest = EXCLUDED.otp_digest,
       flow = EXCLUDED.flow,
       attempts_remaining = EXCLUDED.attempts_remaining,
       expires_at = EXCLUDED.expires_at,
       created_at = now()`,
    [
      normalizedEmail,
      otpDigest(normalizedEmail, otp),
      flow,
      MAX_VERIFY_ATTEMPTS,
      new Date(Date.now() + OTP_TTL_MS),
    ],
  );
}

export async function deleteOtp(email: string, otp: string) {
  const normalizedEmail = normalizeEmail(email);
  await pool.query(
    `DELETE FROM portal.email_otp_challenges
     WHERE email = $1 AND otp_digest = $2`,
    [normalizedEmail, otpDigest(normalizedEmail, otp)],
  );
}

export async function verifyOtp(email: string, otp: string): Promise<OtpFlow | null> {
  const normalizedEmail = normalizeEmail(email);
  const suppliedDigest = Buffer.from(otpDigest(normalizedEmail, otp), "hex");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<OtpRow>(
      `SELECT otp_digest, expires_at, attempts_remaining, flow
       FROM portal.email_otp_challenges
       WHERE email = $1
       FOR UPDATE`,
      [normalizedEmail],
    );
    const entry = result.rows[0];

    if (!entry || entry.expires_at.getTime() <= Date.now()) {
      if (entry) {
        await client.query(
          "DELETE FROM portal.email_otp_challenges WHERE email = $1",
          [normalizedEmail],
        );
      }
      await client.query("COMMIT");
      return null;
    }

    const expectedDigest = Buffer.from(entry.otp_digest, "hex");
    const matches =
      suppliedDigest.length === expectedDigest.length &&
      timingSafeEqual(suppliedDigest, expectedDigest);

    if (!matches) {
      if (entry.attempts_remaining <= 1) {
        await client.query(
          "DELETE FROM portal.email_otp_challenges WHERE email = $1",
          [normalizedEmail],
        );
      } else {
        await client.query(
          `UPDATE portal.email_otp_challenges
           SET attempts_remaining = attempts_remaining - 1
           WHERE email = $1`,
          [normalizedEmail],
        );
      }
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      "DELETE FROM portal.email_otp_challenges WHERE email = $1",
      [normalizedEmail],
    );
    await client.query("COMMIT");
    return entry.flow;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
