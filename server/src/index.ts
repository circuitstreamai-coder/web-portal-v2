import { createServer } from "./servers/yoga-http.js";
import { seedUsers } from "./db/seed.js";
import { assertProductionConfiguration } from "./config/production.js";

function shouldSeedOnStartup() {
  if (process.env.SEED_ON_STARTUP) {
    return process.env.SEED_ON_STARTUP === "true";
  }

  return process.env.NODE_ENV !== "production";
}

async function main() {
  assertProductionConfiguration();
  const app = await createServer();

  if (shouldSeedOnStartup()) {
    const { created, skipped } = await seedUsers();
    if (created.length > 0) console.log("[seed] Created users:", created);
    if (skipped.length > 0) console.log("[seed] Skipped (already exist):", skipped);
  }

  const port = parseInt(process.env.PORT ?? "4000", 10);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server running on port ${port}`);
}

main();
