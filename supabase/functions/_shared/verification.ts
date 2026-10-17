const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("VERIFICATION_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function digestOtp(email: string, otp: string): Promise<string> {
  const secret = Deno.env.get("VERIFICATION_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const data = encoder.encode(`${email.trim().toLowerCase()}:${otp}:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function issueVerificationProof(email: string, flow: string): Promise<string> {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({
    email: email.trim().toLowerCase(),
    flow,
    exp: Date.now() + 15 * 60 * 1000,
  })));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyVerificationProof(
  proof: unknown,
  email: string,
  flow: string,
): Promise<boolean> {
  if (typeof proof !== "string") return false;
  const [payload, signature] = proof.split(".");
  if (!payload || !signature) return false;
  const signatureBytes = base64UrlToBytes(signature);
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    signatureBytes.buffer as ArrayBuffer,
    encoder.encode(payload),
  );
  if (!valid) return false;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    return parsed.email === email.trim().toLowerCase() && parsed.flow === flow && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
