export const migration003MessageFiles = {
  version: 3,
  up: ({ db }) => {
    const schemaSql = `
      CREATE TABLE IF NOT EXISTS chat_message_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (message_id) REFERENCES chat_messages (id)
      );

      CREATE INDEX IF NOT EXISTS idx_message_files_message_id ON chat_message_files(message_id);
    `

    schemaSql
      .trim()
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .forEach((statement) => db.run(statement))
  },
}

