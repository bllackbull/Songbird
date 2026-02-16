export const migration003MailSystem = {
  version: 3,
  up: ({ db }) => {
    const schemaSql = `
      CREATE TABLE IF NOT EXISTS mail_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_user_id INTEGER,
        sender_email TEXT NOT NULL,
        sender_name TEXT,
        recipient_user_id INTEGER NOT NULL,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'internal',
        received_at TEXT NOT NULL DEFAULT (datetime('now')),
        read_at TEXT,
        deleted_by_recipient INTEGER NOT NULL DEFAULT 0,
        deleted_by_sender INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (sender_user_id) REFERENCES users (id),
        FOREIGN KEY (recipient_user_id) REFERENCES users (id)
      );

      CREATE INDEX IF NOT EXISTS idx_mail_recipient_time ON mail_messages(recipient_user_id, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mail_recipient_unread ON mail_messages(recipient_user_id, read_at);
      CREATE INDEX IF NOT EXISTS idx_mail_recipient_email ON mail_messages(recipient_email);
    `;

    schemaSql
      .trim()
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean)
      .forEach((statement) => db.run(statement));
  },
};
