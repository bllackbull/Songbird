export const migration006MessageFileExpiry = {
  version: 6,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists('chat_message_files')) return

    if (!hasColumn('chat_message_files', 'expires_at')) {
      db.run('ALTER TABLE chat_message_files ADD COLUMN expires_at TEXT')
    }
  },
}
