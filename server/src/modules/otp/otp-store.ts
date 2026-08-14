import { createHash, timingSafeEqual } from "node:crypto";

export type OtpFlow = "customer" | "engineer";

type OtpEntry = {
  digest: Buffer;
  expires: number;
  attemptsRemaining: number;
  flow: OtpFlow;
};

const store = new Map<string, OtpEntry>();
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_STORE_SIZE = 5000;
const MAX_VERIFY_ATTEMPTS = 5;

function otpDigest(email: string, otp: string) {
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${otp}`)
    .digest();
}

function pruneExpired(now: number) {
  for (const [email, entry] of store) {
    if (entry.expires <= now) store.delete(email);
  }
}

function enforceSizeLimit() {
  if (store.size <= MAX_STORE_SIZE) return;
  const entries = [...store.entries()].sort((a, b) => a[1].expires - b[1].expires);
  for (let i = 0; i < store.size - MAX_STORE_SIZE; i++) store.delete(entries[i][0]);
}

export function saveOtp(email: string, otp: string, flow: OtpFlow) {
  const normalizedEmail = email.toLowerCase();
  const now = Date.now();
  pruneExpired(now);
  store.set(normalizedEmail, {
    digest: otpDigest(normalizedEmail, otp),
    expires: now + OTP_TTL_MS,
    attemptsRemaining: MAX_VERIFY_ATTEMPTS,
    flow,
  });
  enforceSizeLimit();
}

export function verifyOtp(email: string, otp: string): OtpFlow | null {
  const normalizedEmail = email.toLowerCase();
  const now = Date.now();
  pruneExpired(now);
  const entry = store.get(normalizedEmail);

  if (!entry || now > entry.expires) {
    store.delete(normalizedEmail);
    return null;
  }

  const suppliedDigest = otpDigest(normalizedEmail, otp);
  if (!timingSafeEqual(entry.digest, suppliedDigest)) {
    entry.attemptsRemaining -= 1;
    if (entry.attemptsRemaining <= 0) store.delete(normalizedEmail);
    return null;
  }

  store.delete(normalizedEmail);
  return entry.flow;
}
