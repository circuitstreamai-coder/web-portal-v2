import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getDatabasePoolConfig, getDatabaseSslConfig, getDatabaseUrl } from "./config.js";

const connectionString = getDatabaseUrl();

const pool = new pg.Pool({
  connectionString,
  ssl: getDatabaseSslConfig(connectionString),
  ...getDatabasePoolConfig(),
});

export const db = drizzle(pool);
export { pool };
