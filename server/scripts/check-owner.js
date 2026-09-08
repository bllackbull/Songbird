import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";

async function main() {
  const remoteResult = await runAdminActionViaServer("check_owner_exists");
  if (remoteResult && typeof remoteResult.hasOwner === "boolean") {
    process.exit(remoteResult.hasOwner ? 0 : 1);
  }

  const dbApi = await openDatabase();
  try {
    const row = await dbApi.getRow(
      "SELECT id FROM users WHERE role = ? LIMIT 1",
      ["owner"],
    );
    process.exit(row && row.id ? 0 : 1);
  } finally {
    await dbApi.close();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
