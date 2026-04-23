export const migration022MessageClientRequestId = {
  version: 22,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists("chat_messages")) return;

    if (!hasColumn("chat_messages", "client_request_id")) {
      db.run("ALTER TABLE chat_messages ADD COLUMN client_request_id TEXT");
    }

    db.run(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_request ON chat_messages(chat_id, user_id, client_request_id)",
    );
  },
};
