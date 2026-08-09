import dotenv from "dotenv";

dotenv.config();

function parseBoolean(value?: string) {
  if (!value) return undefined;
  return value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isNeonConnectionString(connectionString?: string) {
  return connectionString?.includes("neon.tech") ?? false;
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL;
}

export function getMigrationDatabaseUrl() {
  return process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
}

export function getDatabaseSslConfig(connectionString?: string) {
  const sslEnabled = parseBoolean(process.env.DATABASE_SSL);
  const rejectUnauthorized = parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
  );

  if (sslEnabled === false) {
    return false;
  }

  if (sslEnabled === true || isNeonConnectionString(connectionString)) {
    return {
      rejectUnauthorized: rejectUnauthorized ?? false,
    };
  }

  return undefined;
}

export function getDatabasePoolConfig() {
  return {
    max: parseNumber(process.env.DATABASE_POOL_MAX, 20),
    min: parseNumber(process.env.DATABASE_POOL_MIN, 2),
    idleTimeoutMillis: parseNumber(process.env.DATABASE_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMillis: parseNumber(
      process.env.DATABASE_CONNECTION_TIMEOUT_MS,
      10_000,
    ),
  };
}
