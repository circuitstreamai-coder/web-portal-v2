import { createHmac, timingSafeEqual } from "node:crypto";
import type { OtpFlow } from "./otp-store.js";

const PROOF_TTL_SECONDS = 15 * 60;

type VerificationPayload = {
  email: string;
  flow: OtpFlow;
  exp: number;
};

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createEmailVerificationProof(email: string, flow: OtpFlow) {
  const payload: VerificationPayload = {
    email: email.trim().toLowerCase(),
    flow,
    exp: Math.floor(Date.now() / 1000) + PROOF_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function isEmailVerificationProofValid(
  token: string | undefined,
  email: string,
  flow: OtpFlow,
) {
  if (!token) return false;
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return false;

  const expectedSignature = sign(encodedPayload);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as VerificationPayload;

    return (
      payload.email === email.trim().toLowerCase() &&
      payload.flow === flow &&
      payload.exp >= Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
