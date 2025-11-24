import { primaryKeyChange } from "../db/index.js";
console.log("🏃‍♂️ Migrating DB...");

primaryKeyChange().catch((err) => {
  console.error(err);
  process.exit(1);
});
