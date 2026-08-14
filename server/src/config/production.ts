import { isEmailConfigured } from "../services/email.js";

const REQUIRED_PRODUCTION_VARIABLES = [
  "DATABASE_URL",
  "JWT_SECRET",
  "CORS_ORIGIN",
  "FRONTEND_URL",
  "BASE_URL",
  "SMTP_FROM",
] as const;

function isHttpsUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function assertProductionConfiguration() {
  if (process.env.NODE_ENV !== "production") return;

  const invalid: string[] = REQUIRED_PRODUCTION_VARIABLES.filter(
    (name) => !process.env[name]?.trim(),
  );

  if (!isEmailConfigured()) {
    invalid.push("RESEND_API_KEY or SMTP_USER+SMTP_PASS");
  }

  for (const name of ["FRONTEND_URL", "BASE_URL"] as const) {
    if (process.env[name] && !isHttpsUrl(process.env[name])) {
      invalid.push(`${name} (must be HTTPS)`);
    }
  }

  if (invalid.length > 0) {
    throw new Error(
      `Invalid production configuration: ${[...new Set(invalid)].join(", ")}`,
    );
  }
}
