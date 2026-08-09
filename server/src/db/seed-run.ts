import { eq } from "drizzle-orm";
import { pool } from "./db.js";
import { db } from "./db.js";
import { users } from "./schema/index.js";
import {
  seedRoles,
  seedUsers,
  seedTicketCategories,
  seedCustomers,
  seedEngineerProfiles,
  seedProjects,
  seedTickets,
  seedTicketHistory,
  seedAttachments,
  seedInventoryItems,
  seedInventoryTransactions,
} from "./seed.js";

async function main() {
  try {
    console.log("\n[seed] Seeding roles...");
    const roles = await seedRoles();
    console.log(`  Created: ${roles.created.join(", ") || "none"} | Skipped: ${roles.skipped.join(", ") || "none"}`);

    console.log("\n[seed] Seeding users...");
    const { created: usersCreated, skipped: usersSkipped, userIdMap } = await seedUsers();
    console.log(`  Created: ${usersCreated.length} | Skipped: ${usersSkipped.length}`);

    console.log("\n[seed] Seeding ticket categories...");
    const cats = await seedTicketCategories();
    console.log(`  Created: ${cats.created.length} | Skipped: ${cats.skipped.length}`);

    console.log("\n[seed] Seeding customers...");
    const custs = await seedCustomers(userIdMap);
    console.log(`  Created: ${custs.created.length} | Skipped: ${custs.skipped.length}`);

    console.log("\n[seed] Seeding engineer profiles...");
    const engs = await seedEngineerProfiles(userIdMap);
    console.log(`  Created: ${engs.created.length} | Skipped: ${engs.skipped.length}`);

    console.log("\n[seed] Seeding projects...");
    const projs = await seedProjects(custs.customerIdMap, userIdMap);
    console.log(`  Created: ${projs.created.length} | Skipped: ${projs.skipped.length}`);

    console.log("\n[seed] Seeding tickets...");
    const tix = await seedTickets(projs.projectIdMap, cats.categoryIdMap, userIdMap);
    console.log(`  Created: ${tix.created.length} | Skipped: ${tix.skipped.length}`);

    console.log("\n[seed] Seeding ticket history...");
    const hist = await seedTicketHistory(tix.ticketIdMap, userIdMap);
    console.log(`  Created: ${hist.created} | Skipped: ${hist.skipped}`);

    console.log("\n[seed] Seeding attachments...");
    const atts = await seedAttachments(tix.ticketIdMap, userIdMap);
    console.log(`  Created: ${atts.created} | Skipped: ${atts.skipped}`);

    console.log("\n[seed] Seeding inventory items...");
    const inv = await seedInventoryItems();
    console.log(`  Created: ${inv.created.length} | Skipped: ${inv.skipped.length}`);

    const [adminUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "admin@system.com"));

    if (adminUser) {
      console.log("\n[seed] Seeding inventory transactions...");
      const txns = await seedInventoryTransactions(inv.itemIdMap, adminUser.id);
      console.log(`  Created: ${txns.created}`);
    }

    console.log("\n[seed] Done.");
  } catch (error) {
    console.error("[seed] Failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
