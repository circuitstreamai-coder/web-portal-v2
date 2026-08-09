import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import {
  getDatabaseSslConfig,
  getMigrationDatabaseUrl,
} from "./config.js";

async function main() {
  const connectionString = getMigrationDatabaseUrl();

  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL or DATABASE_URL_DIRECT for database migrations",
    );
  }

  const pool = new pg.Pool({
    connectionString,
    ssl: getDatabaseSslConfig(connectionString),
  });

  const db = drizzle(pool);

  try {
    await db.execute(`CREATE SCHEMA IF NOT EXISTS "portal"`);
    await db.execute(`CREATE SCHEMA IF NOT EXISTS "ticket"`);
    await db.execute(`CREATE SCHEMA IF NOT EXISTS "inventory"`);
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully");
  } finally {
    await pool.end();
  }
}

main();
