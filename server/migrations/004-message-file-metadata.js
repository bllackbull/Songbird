export const migration004MessageFileMetadata = {
  version: 4,
  up: ({ db, tableExists, hasColumn }) => {
    if (!tableExists('chat_message_files')) return

    if (!hasColumn('chat_message_files', 'width_px')) {
      db.run('ALTER TABLE chat_message_files ADD COLUMN width_px INTEGER')
    }
    if (!hasColumn('chat_message_files', 'height_px')) {
      db.run('ALTER TABLE chat_message_files ADD COLUMN height_px INTEGER')
    }
    if (!hasColumn('chat_message_files', 'duration_seconds')) {
      db.run('ALTER TABLE chat_message_files ADD COLUMN duration_seconds REAL')
    }
  },
}

