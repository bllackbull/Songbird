function migrateLegacyConversationTables({ db, tableExists }) {
  if (tableExists('conversations')) {
    db.run(`
      INSERT OR IGNORE INTO chats (id, name, type, created_at)
      SELECT
        id,
        name,
        CASE
          WHEN type = 'direct' THEN 'dm'
          ELSE COALESCE(type, 'dm')
        END,
        COALESCE(created_at, datetime('now'))
      FROM conversations
    `)
  }

  if (tableExists('conversation_members')) {
    db.run(`
      INSERT OR IGNORE INTO chat_members (chat_id, user_id, role)
      SELECT conversation_id, user_id, COALESCE(role, 'member')
      FROM conversation_members
    `)
  }
}

function migrateLegacyMessageColumns({ db, tableExists, hasColumn }) {
  if (tableExists('chat_messages') && !hasColumn('chat_messages', 'chat_id') && hasColumn('chat_messages', 'conversation_id')) {
    db.run('ALTER TABLE chat_messages RENAME TO chat_messages_legacy')
    db.run(`
      CREATE TABLE chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        read_at TEXT,
        read_by_user_id INTEGER,
        FOREIGN KEY (chat_id) REFERENCES chats (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `)
    db.run(`
      INSERT INTO chat_messages (id, chat_id, user_id, body, created_at, read_at, read_by_user_id)
      SELECT
        id,
        conversation_id,
        user_id,
        body,
        COALESCE(created_at, datetime('now')),
        read_at,
        read_by_user_id
      FROM chat_messages_legacy
    `)
    db.run('DROP TABLE chat_messages_legacy')
  }

  if (tableExists('hidden_chats') && !hasColumn('hidden_chats', 'chat_id') && hasColumn('hidden_chats', 'conversation_id')) {
    db.run('ALTER TABLE hidden_chats RENAME TO hidden_chats_legacy')
    db.run(`
      CREATE TABLE hidden_chats (
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        hidden_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, chat_id),
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (chat_id) REFERENCES chats (id)
      )
    `)
    db.run(`
      INSERT OR IGNORE INTO hidden_chats (user_id, chat_id, hidden_at)
      SELECT user_id, conversation_id, COALESCE(hidden_at, datetime('now'))
      FROM hidden_chats_legacy
    `)
    db.run('DROP TABLE hidden_chats_legacy')
  }
}

export const migration002LegacyChatRename = {
  version: 2,
  up: (context) => {
    const { db, hasColumn, getAll, getRandomUserColor } = context

    migrateLegacyConversationTables(context)
    migrateLegacyMessageColumns(context)

    if (!hasColumn('users', 'nickname')) {
      db.run('ALTER TABLE users ADD COLUMN nickname TEXT')
    }
    if (!hasColumn('users', 'avatar_url')) {
      db.run('ALTER TABLE users ADD COLUMN avatar_url TEXT')
    }
    if (!hasColumn('users', 'color')) {
      db.run('ALTER TABLE users ADD COLUMN color TEXT')
    }
    if (!hasColumn('users', 'status')) {
      db.run("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'online'")
    }
    if (!hasColumn('users', 'last_seen')) {
      db.run("ALTER TABLE users ADD COLUMN last_seen TEXT")
    }
    if (!hasColumn('chat_messages', 'read_at')) {
      db.run("ALTER TABLE chat_messages ADD COLUMN read_at TEXT")
    }
    if (!hasColumn('chat_messages', 'read_by_user_id')) {
      db.run('ALTER TABLE chat_messages ADD COLUMN read_by_user_id INTEGER')
    }

    if (hasColumn('chat_messages', 'chat_id')) {
      db.run('CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON chat_messages(chat_id, created_at)')
    }

    const usersMissingColor = getAll("SELECT id FROM users WHERE color IS NULL OR TRIM(color) = ''")
    usersMissingColor.forEach((row) => {
      db.run('UPDATE users SET color = ? WHERE id = ?', [getRandomUserColor(), row.id])
    })
  },
}
