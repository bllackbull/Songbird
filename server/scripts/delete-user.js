import { confirmAction, getCliArgs, getPositionalArgs, hasForceYes } from './_cli.js'
import { openDatabase, removeStoredFiles, chunkArray, runAdminActionViaServer } from './_db-admin.js'

function resolveUserIds(dbApi, selectors) {
  const ids = new Set()
  selectors.forEach((selector) => {
    const raw = String(selector || '').trim()
    if (!raw) return
    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric > 0) {
      ids.add(Math.trunc(numeric))
      return
    }
    const row = dbApi.getRow('SELECT id FROM users WHERE username = ?', [raw])
    if (row?.id) {
      ids.add(Number(row.id))
    }
  })
  return Array.from(ids)
}

function cleanupOrphanChats(dbApi) {
  const orphanRows = dbApi.getAll(
    `
      SELECT c.id
      FROM chats c
      LEFT JOIN chat_members cm ON cm.chat_id = c.id
      GROUP BY c.id
      HAVING COUNT(cm.user_id) = 0
    `,
  )
  const orphanChatIds = orphanRows
    .map((row) => Number(row.id))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (!orphanChatIds.length) {
    return { removedChats: 0, removedFiles: 0, missingFiles: 0 }
  }

  const placeholders = orphanChatIds.map(() => '?').join(', ')
  const fileRows = dbApi.getAll(
    `
      SELECT cmf.stored_name
      FROM chat_message_files cmf
      JOIN chat_messages cm ON cm.id = cmf.message_id
      WHERE cm.chat_id IN (${placeholders})
    `,
    orphanChatIds,
  )
  const storedNames = fileRows.map((row) => row.stored_name)

  chunkArray(orphanChatIds, 500).forEach((chunk) => {
    const chunkPlaceholders = chunk.map(() => '?').join(', ')
    dbApi.run(
      `DELETE FROM chat_message_files WHERE message_id IN (
        SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
      )`,
      chunk,
    )
    dbApi.run(`DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`, chunk)
    dbApi.run(`DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`, chunk)
    dbApi.run(`DELETE FROM chats WHERE id IN (${chunkPlaceholders})`, chunk)
  })

  const cleanup = removeStoredFiles(storedNames)
  return {
    removedChats: orphanChatIds.length,
    removedFiles: cleanup.removed,
    missingFiles: cleanup.missing,
  }
}

const args = getCliArgs()
const selectors = getPositionalArgs(args)
const force = hasForceYes(args)
const remoteResult = await runAdminActionViaServer('delete_users', { selectors })
if (remoteResult) {
  console.log(`Server mode: users deleted: ${remoteResult.removedUsers ?? 0}`)
  console.log(`Server mode: stored files removed: ${remoteResult.removedFiles ?? 0}`)
} else {
  const dbApi = await openDatabase()
  try {
    let userIds = resolveUserIds(dbApi, selectors)

    if (!selectors.length) {
      userIds = dbApi
        .getAll('SELECT id FROM users ORDER BY id ASC')
        .map((row) => Number(row.id))
        .filter((value) => Number.isFinite(value) && value > 0)
    }

    if (!userIds.length) {
      console.log('No users matched. Nothing to delete.')
    } else {
      const placeholders = userIds.map(() => '?').join(', ')
      const fileRows = dbApi.getAll(
        `
          SELECT cmf.stored_name
          FROM chat_message_files cmf
          JOIN chat_messages cm ON cm.id = cmf.message_id
          WHERE cm.user_id IN (${placeholders})
        `,
        userIds,
      )
      const storedNames = fileRows.map((row) => row.stored_name)

      const confirmed = await confirmAction({
        prompt: selectors.length
          ? `Delete ${userIds.length} selected user(s) and their sessions/messages?`
          : `Delete ALL users (${userIds.length}) and their sessions/messages?`,
        force,
        forceHint: 'Refusing to delete users in non-interactive mode without -y/--yes. Run: npm run db:user:delete -- -y',
      })

      if (!confirmed) {
        console.log('Aborted.')
      } else {
        dbApi.run('BEGIN')
        try {
          chunkArray(userIds, 500).forEach((chunk) => {
            const chunkPlaceholders = chunk.map(() => '?').join(', ')
            dbApi.run(`DELETE FROM sessions WHERE user_id IN (${chunkPlaceholders})`, chunk)
            dbApi.run(`DELETE FROM hidden_chats WHERE user_id IN (${chunkPlaceholders})`, chunk)
            dbApi.run(`UPDATE chat_messages SET read_by_user_id = NULL WHERE read_by_user_id IN (${chunkPlaceholders})`, chunk)
            dbApi.run(
              `DELETE FROM chat_message_files WHERE message_id IN (
                SELECT id FROM chat_messages WHERE user_id IN (${chunkPlaceholders})
              )`,
              chunk,
            )
            dbApi.run(`DELETE FROM chat_messages WHERE user_id IN (${chunkPlaceholders})`, chunk)
            dbApi.run(`DELETE FROM chat_members WHERE user_id IN (${chunkPlaceholders})`, chunk)
            dbApi.run(`DELETE FROM users WHERE id IN (${chunkPlaceholders})`, chunk)
          })

          const orphanCleanup = cleanupOrphanChats(dbApi)
          dbApi.run('COMMIT')

          const fileCleanup = removeStoredFiles(storedNames)
          dbApi.save()

          console.log(`Users deleted: ${userIds.length}`)
          console.log(`Stored files removed: ${fileCleanup.removed + orphanCleanup.removedFiles}`)
          console.log(`Stored files missing on disk: ${fileCleanup.missing + orphanCleanup.missingFiles}`)
          console.log(`Orphan chats removed: ${orphanCleanup.removedChats}`)
        } catch (error) {
          dbApi.run('ROLLBACK')
          throw error
        }
      }
    }
  } finally {
    dbApi.close()
  }
}
