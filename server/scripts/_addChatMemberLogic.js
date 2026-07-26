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
export function addChatMembers(dbApi, chat, rows, { force = false } = {}) {
  const existingOwnerIds = new Set(
    dbApi
      .getAll(
        "SELECT user_id FROM chat_members WHERE chat_id = ? AND role = 'owner'",
        [Number(chat.id)],
      )
      .map((row) => Number(row.user_id)),
  );

  let addedCount = 0;
  let skippedLeftCount = 0;

  rows.forEach((row) => {
    const existing = dbApi.getRow(
      "SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?",
      [Number(chat.id), Number(row.id)],
    );
    if (existing?.role) return;

    if (!force) {
      const priorLeft = dbApi.getRow(
        `SELECT 1 AS prior_left
         FROM chat_left_members
         WHERE chat_id = ? AND user_id = ?
         UNION
         SELECT 1 AS prior_left
         FROM chat_messages
         WHERE chat_id = ? AND user_id = ? AND body LIKE ?
         LIMIT 1`,
        [
          Number(chat.id),
          Number(row.id),
          Number(chat.id),
          Number(row.id),
          "[[system:left:%",
        ],
      );
      if (priorLeft?.prior_left) {
        skippedLeftCount += 1;
        return;
      }
    }

    const role = existingOwnerIds.has(Number(row.id)) ? "owner" : "member";
    dbApi.run(
      "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
      [Number(chat.id), Number(row.id), role],
    );
    addedCount += 1;
  });

  dbApi.save();
  return { addedCount, skippedLeftCount };
}
