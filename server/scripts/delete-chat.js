import { confirmAction, getCliArgs, getPositionalArgs, hasForceYes } from './_cli.js'
import { openDatabase, removeStoredFiles, chunkArray, runAdminActionViaServer } from './_db-admin.js'

function parseChatIds(args) {
  const positional = getPositionalArgs(args)
  const ids = positional
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  return Array.from(new Set(ids))
}

function deleteChatsByIds(dbApi, chatIds) {
  const { getAll, run } = dbApi
  const placeholders = chatIds.map(() => '?').join(', ')
  const fileRows = getAll(
    `
      SELECT cmf.stored_name
      FROM chat_message_files cmf
      JOIN chat_messages cm ON cm.id = cmf.message_id
      WHERE cm.chat_id IN (${placeholders})
    `,
    chatIds,
  )
  const storedNames = fileRows.map((row) => row.stored_name)

  run('BEGIN')
  try {
    chunkArray(chatIds, 500).forEach((chunk) => {
      const chunkPlaceholders = chunk.map(() => '?').join(', ')
      run(
        `DELETE FROM chat_message_files WHERE message_id IN (
          SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
        )`,
        chunk,
      )
      run(`DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`, chunk)
      run(`DELETE FROM chat_members WHERE chat_id IN (${chunkPlaceholders})`, chunk)
      run(`DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`, chunk)
      run(`DELETE FROM chats WHERE id IN (${chunkPlaceholders})`, chunk)
    })
    run('COMMIT')
  } catch (error) {
    run('ROLLBACK')
    throw error
  }

  const fileCleanup = removeStoredFiles(storedNames)
  return {
    removedChats: chatIds.length,
    removedFiles: fileCleanup.removed,
    missingFiles: fileCleanup.missing,
  }
}

const args = getCliArgs()
const force = hasForceYes(args)
const requestedChatIds = parseChatIds(args)
const remoteResult = await runAdminActionViaServer('delete_chats', { chatIds: requestedChatIds })
if (remoteResult) {
  console.log(`Server mode: chats deleted: ${remoteResult.removedChats ?? 0}`)
  console.log(`Server mode: stored files removed: ${remoteResult.removedFiles ?? 0}`)
} else {
  const dbApi = await openDatabase()
  try {
    let chatIds = requestedChatIds

    if (!chatIds.length) {
      chatIds = dbApi
        .getAll('SELECT id FROM chats ORDER BY id ASC')
        .map((row) => Number(row.id))
        .filter((value) => Number.isFinite(value) && value > 0)
    }

    if (!chatIds.length) {
      console.log('No chats found. Nothing to delete.')
    } else {
      const confirmed = await confirmAction({
        prompt: requestedChatIds.length
          ? `Delete ${chatIds.length} selected chat(s) and related data?`
          : `Delete ALL chats (${chatIds.length}) and related data?`,
        force,
        forceHint: 'Refusing to delete chats in non-interactive mode without -y/--yes. Run: npm run db:chat:delete -- -y',
      })

      if (!confirmed) {
        console.log('Aborted.')
      } else {
        const result = deleteChatsByIds(dbApi, chatIds)
        dbApi.save()
        console.log(`Chats deleted: ${result.removedChats}`)
        console.log(`Stored files removed: ${result.removedFiles}`)
        console.log(`Stored files missing on disk: ${result.missingFiles}`)
      }
    }
  } finally {
    dbApi.close()
  }
}
