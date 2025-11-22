import { migrateDb } from "../db/index.js";
console.log("🏃‍♂️ Migrating DB...");

migrateDb().catch((err) => {
  console.error(err);
  process.exit(1);
});
