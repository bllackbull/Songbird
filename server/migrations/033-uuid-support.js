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

  // Backfill existing rows with generated UUIDs if empty
  const usersWithoutUuid = await knex("users").whereNull("uuid").select("id");
  for (const user of usersWithoutUuid) {
    await knex("users").where({ id: user.id }).update({ uuid: generateUuid() });
  }

  const chatsWithoutUuid = await knex("chats").whereNull("uuid").select("id");
  for (const chat of chatsWithoutUuid) {
    await knex("chats").where({ id: chat.id }).update({ uuid: generateUuid() });
  }

  const messagesWithoutUuid = await knex("chat_messages")
    .whereNull("uuid")
    .select("id");
  for (const msg of messagesWithoutUuid) {
    await knex("chat_messages")
      .where({ id: msg.id })
      .update({ uuid: generateUuid() });
  }
}

export async function down(knex) {
  // Safe down migration: keep columns to prevent data loss
}
