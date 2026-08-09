import { pool } from "./db.js";
import { seedDemoData } from "./demo-seed.js";

async function main() {
  try {
    const result = await seedDemoData();
    console.log("[demo-seed] Default password:", result.password);
    console.log("[demo-seed] Users:", result.users);
    console.log("[demo-seed] Customers:", result.customers);
    console.log("[demo-seed] Engineer profiles:", result.engineerProfiles);
    console.log("[demo-seed] Categories:", result.categories);
    console.log("[demo-seed] Projects:", result.projects);
    console.log("[demo-seed] Files:", result.files);
    console.log("[demo-seed] Tickets:", result.tickets);
    console.log("[demo-seed] Ticket list:");
    result.ticketsCreated.forEach((ticket) => {
      console.log(`- ${ticket.ticketNumber}: ${ticket.title}`);
    });
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[demo-seed] Failed to seed demo data", error);
  process.exit(1);
});
