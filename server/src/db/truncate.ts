import { pool } from "./db.js";

const TABLES_TO_TRUNCATE = [
  "portal.user_roles",
  "ticket.attachments",
  "ticket.ticket_history",
  "ticket.tickets",
  "ticket.projects",
  "ticket.engineer_profiles",
  "ticket.customers",
  "ticket.file_chunks",
  "ticket.files",
  "portal.users",
];

async function main() {
  try {
    await pool.query(`
      TRUNCATE TABLE
        ${TABLES_TO_TRUNCATE.join(",\n        ")}
      RESTART IDENTITY CASCADE;
    `);

    console.log("Truncated tables successfully:");
    TABLES_TO_TRUNCATE.forEach((table) => console.log(`- ${table}`));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to truncate database tables", error);
  process.exit(1);
});
