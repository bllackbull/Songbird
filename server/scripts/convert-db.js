import path from "node:path";
import { convertSqliteToPostgres } from "../lib/convertDb.js";
import { readDbConfig } from "../settings/env.js";

async function main() {
  const args = process.argv.slice(2);
  const sqlitePath = args[0] || path.resolve("../data/songbird.db");

  const dbConfig = readDbConfig();
  if (dbConfig.client !== "postgres") {
    console.error("Error: Target DB_CLIENT is not configured as PostgreSQL.");
    process.exit(1);
  }

  console.log(`Converting SQLite database (${sqlitePath}) to PostgreSQL...`);
  try {
    const result = await convertSqliteToPostgres({
      sqlitePath,
      postgresConfig: dbConfig.postgres,
    });
    console.log(
      `Success! Converted ${result.tablesConverted} tables into PostgreSQL.`,
    );
  } catch (err) {
    console.error("Conversion failed:", err.message);
    process.exit(1);
  }
}

if (process.argv[1].includes("convert-db.js")) {
  main();
}
