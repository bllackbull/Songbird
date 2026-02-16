export const migration004MailSenderTrash = {
  version: 4,
  up: ({ db, hasColumn }) => {
    if (!hasColumn("mail_messages", "deleted_by_sender")) {
      db.run(
        "ALTER TABLE mail_messages ADD COLUMN deleted_by_sender INTEGER NOT NULL DEFAULT 0",
      );
    }
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_mail_sender_time ON mail_messages(sender_user_id, received_at DESC)",
    );
  },
};
