import type { Config } from "drizzle-kit";
import { getMigrationDatabaseUrl } from "./src/db/config";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getMigrationDatabaseUrl()!,
  },
} satisfies Config;
