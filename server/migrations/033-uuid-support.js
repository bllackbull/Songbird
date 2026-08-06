import { generateUuid } from "../lib/uuidUtils.js";

/**
 * Migration 033: Add UUID columns to users, chats, and chat_messages tables.
 */
export async function up(knex) {
  // Add uuid column to users
  const hasUsersUuid = await knex.schema.hasColumn("users", "uuid");
  if (!hasUsersUuid) {
    await knex.schema.alterTable("users", (table) => {
      table.string("uuid", 36).nullable().index();
    });
  }

  // Add uuid column to chats
  const hasChatsUuid = await knex.schema.hasColumn("chats", "uuid");
  if (!hasChatsUuid) {
    await knex.schema.alterTable("chats", (table) => {
      table.string("uuid", 36).nullable().index();
    });
  }

  // Add uuid column to chat_messages
  const hasMessagesUuid = await knex.schema.hasColumn("chat_messages", "uuid");
  if (!hasMessagesUuid) {
    await knex.schema.alterTable("chat_messages", (table) => {
      table.string("uuid", 36).nullable().index();
    });
  }

  // Backfill existing rows with generated UUIDs in chunked transactions
  const tables = ["users", "chats", "chat_messages"];
  const chunkSize = 500;

  for (const table of tables) {
    while (true) {
      const rows = await knex(table).whereNull("uuid").select("id").limit(chunkSize);
      if (!rows.length) break;

      await knex.transaction(async (trx) => {
        for (const row of rows) {
          await trx(table).where({ id: row.id }).update({ uuid: generateUuid() });
        }
      });
    }
  }
}

export async function down(knex) {
  // Safe down migration: keep columns to prevent data loss
}
