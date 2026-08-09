const store = new Map<string, { otp: string; expires: number }>();
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_STORE_SIZE = 5000;

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

export function saveOtp(email: string, otp: string) {
  const now = Date.now();
  pruneExpired(now);
  store.set(email.toLowerCase(), { otp, expires: now + OTP_TTL_MS });
  enforceSizeLimit();
}

export function verifyOtp(email: string, otp: string): boolean {
  const now = Date.now();
  pruneExpired(now);
  const entry = store.get(email.toLowerCase());
  if (!entry || now > entry.expires) { store.delete(email.toLowerCase()); return false; }
  if (entry.otp !== otp) return false;
  store.delete(email.toLowerCase());
  return true;
}
