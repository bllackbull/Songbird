import { dbKnex } from "../db/knex.js";

/**
 * Pure business logic for adding members to a chat.
 *
 * Extracted from add-chat-member.js so it can be unit-tested without a real
 * database or process.argv context.
 *
 * @param {object} dbApi   - Database API object with getRow / getAll / run / save
 * @param {object} chat    - Chat row (must have `id`, `type`, `name`)
 * @param {Array}  rows    - Array of user rows to add (each must have `id`)
 * @param {object} options
 * @param {boolean} [options.force=false] - When true, bypass the priorLeft check
 *   and add users who previously left the chat.
 * @returns {{ addedCount: number, skippedLeftCount: number }}
 */
export async function addChatMembers(dbApi, chat, rows, { force = false } = {}) {
  const members = await dbApi.getAll(
    "SELECT user_id FROM chat_members WHERE chat_id = ? AND role = 'owner'",
    [chat.id],
  );
  const existingOwnerIds = new Set(
    (Array.isArray(members) ? members : []).map((row) => row?.user_id),
  );

  let addedCount = 0;
  let skippedLeftCount = 0;

  for (const row of rows) {
    const existing = await dbApi.getRow(
      "SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?",
      [chat.id, row.id],
    );
    if (existing?.role) continue;

    if (!force) {
      const priorLeft = await dbApi.getRow(
        `SELECT 1 AS prior_left
         FROM chat_left_members
         WHERE chat_id = ? AND user_id = ?
         UNION
         SELECT 1 AS prior_left
         FROM chat_messages
         WHERE chat_id = ? AND user_id = ? AND body LIKE ?
         LIMIT 1`,
        [
          chat.id,
          row.id,
          chat.id,
          row.id,
          "[[system:left:%",
        ],
      );
      if (priorLeft?.prior_left) {
        skippedLeftCount += 1;
        continue;
      }
    }

    const role = existingOwnerIds.has(row.id) ? "owner" : "member";
    await dbApi.run(
      "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [chat.id, row.id, role],
    );
    if (chat.type === "group") {
      await dbApi.run(
        "INSERT INTO chat_messages (chat_id, user_id, body) VALUES (?, ?, ?)",
        [
          chat.id,
          row.id,
          `[[system:joined:${row.nickname || row.username}]]`,
        ],
      );
    }
    addedCount += 1;
  }

  await dbApi.save();
  return { addedCount, skippedLeftCount };
}
