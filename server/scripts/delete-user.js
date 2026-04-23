import { confirmAction, getCliArgs, getPositionalArgs, hasForceYes, hasFlag } from './_cli.js'
import {
  openDatabase,
  removeStoredFiles,
  chunkArray,
  runAdminActionViaServer,
  detectRunningServer,
} from './_db-admin.js'

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
    const groupRow = dbApi.getRow(
      "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username = ?",
      [raw],
    )
    if (groupRow?.id) {
      throw new Error(`Cannot delete user. "${raw}" is a group/channel username.`)
    }
    const row = dbApi.getRow('SELECT id FROM users WHERE username = ?', [raw])
    if (row?.id) {
      ids.add(Number(row.id))
    }
  })
  return Array.from(ids)
}

async function main() {
  const args = getCliArgs()
  const selectors = getPositionalArgs(args)
  const force = hasForceYes(args)
  const hasAll = hasFlag(args, '--all')

  const dbApi = await openDatabase()
  try {
    let userIds = []
    try {
      userIds = resolveUserIds(dbApi, selectors)
    } catch (error) {
      const message = String(error?.message || '')
      if (message.includes('group/channel username') || message.includes('group username')) {
        console.error('Unable to delete a group or channel with db:user:delete.')
        process.exitCode = 1
        return
      }
      throw error
    }

    if (!selectors.length) {
      if (!hasAll) {
        console.error('Refusing to delete all users without --all.')
        process.exitCode = 1
        return
      }
      userIds = dbApi
        .getAll('SELECT id FROM users ORDER BY id ASC')
        .map((row) => Number(row.id))
        .filter((value) => Number.isFinite(value) && value > 0)
    }

    if (!userIds.length) {
      console.log('No users matched. Nothing to delete.')
      return
    }

    const confirmed = await confirmAction({
      prompt: selectors.length
        ? `Delete ${userIds.length} selected user(s) and their sessions/messages?`
        : `Delete ALL users (${userIds.length}) and their sessions/messages?`,
      force,
      forceHint: 'Refusing to delete users in non-interactive mode without -y/--yes. Run: npm run db:user:delete -- -y',
    })

    if (!confirmed) {
      console.log('Aborted.')
      return
    }

    const { running } = await detectRunningServer()
    if (running) {
      try {
        const remoteResult = await runAdminActionViaServer('delete_users', { selectors })
        console.log(`Server mode: users deleted: ${remoteResult.removedUsers ?? 0}`)
        console.log(`Server mode: stored files removed: ${remoteResult.removedFiles ?? 0}`)
        return
      } catch (error) {
        const message = String(error?.message || '')
        if (message.includes('group/channel username') || message.includes('group username')) {
          console.error('Unable to delete a group or channel with db:user:delete.')
          process.exitCode = 1
          return
        }
        throw error
      }
    }

    const placeholders = userIds.map(() => '?').join(', ')
    const ownerChatRows = dbApi.getAll(
      `SELECT chat_id FROM chat_members WHERE role = 'owner' AND user_id IN (${placeholders})`,
      userIds,
    )
    const ownerChatIds = Array.from(
      new Set(ownerChatRows.map((row) => Number(row?.chat_id || 0)).filter(Boolean)),
    )
    const chatIdsToDelete = []
    const ownershipTransfers = []
    ownerChatIds.forEach((chatId) => {
      const remaining = dbApi
        .getAll(
          `SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id NOT IN (${placeholders})`,
          [Number(chatId), ...userIds],
        )
        .map((row) => Number(row?.user_id || 0))
        .filter((id) => Number.isFinite(id) && id > 0)
      if (!remaining.length) {
        chatIdsToDelete.push(Number(chatId))
        return
      }
      const nextOwnerId = remaining[Math.floor(Math.random() * remaining.length)]
      if (nextOwnerId) {
        ownershipTransfers.push({
          chatId: Number(chatId),
          nextOwnerId: Number(nextOwnerId),
        })
      }
    })
    const uniqueChatDeletes = Array.from(
      new Set(chatIdsToDelete.filter((id) => Number.isFinite(id) && id > 0)),
    )
    const chatPlaceholders = uniqueChatDeletes.map(() => '?').join(', ')
    const chatFileRows = uniqueChatDeletes.length
      ? dbApi.getAll(
          `SELECT cmf.stored_name
           FROM chat_message_files cmf
           JOIN chat_messages cm ON cm.id = cmf.message_id
           WHERE cm.chat_id IN (${chatPlaceholders})`,
          uniqueChatDeletes,
        )
      : []
    const storedNames = Array.from(
      new Set(
        [...chatFileRows]
          .map((row) => String(row?.stored_name || '').trim())
          .filter(Boolean),
      ),
    )

    dbApi.run('BEGIN')
    try {
      if (uniqueChatDeletes.length) {
        chunkArray(uniqueChatDeletes, 500).forEach((chunk) => {
          const chunkPlaceholders = chunk.map(() => '?').join(', ')
          dbApi.run(
            `DELETE FROM chat_message_reads WHERE message_id IN (
              SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
            )`,
            chunk,
          )
          dbApi.run(
            `DELETE FROM chat_message_files WHERE message_id IN (
              SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
            )`,
            chunk,
          )
          dbApi.run(
            `DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`,
            chunk,
          )
          dbApi.run(`DELETE FROM chat_members WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          dbApi.run(
            `DELETE FROM chat_left_members WHERE chat_id IN (${chunkPlaceholders})`,
            chunk,
          )
          dbApi.run(`DELETE FROM chat_mutes WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          dbApi.run(
            `DELETE FROM group_removed_members WHERE chat_id IN (${chunkPlaceholders})`,
            chunk,
          )
          dbApi.run(`DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          dbApi.run(`DELETE FROM chats WHERE id IN (${chunkPlaceholders})`, chunk)
        })
      }
      ownershipTransfers.forEach((transfer) => {
        if (
          uniqueChatDeletes.includes(Number(transfer.chatId)) ||
          !transfer.chatId ||
          !transfer.nextOwnerId
        ) {
          return
        }
        dbApi.run('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?', [
          'owner',
          Number(transfer.chatId),
          Number(transfer.nextOwnerId),
        ])
      })
      chunkArray(userIds, 500).forEach((chunk) => {
        const chunkPlaceholders = chunk.map(() => '?').join(', ')
        dbApi.run(`DELETE FROM sessions WHERE user_id IN (${chunkPlaceholders})`, chunk)
        dbApi.run(`DELETE FROM hidden_chats WHERE user_id IN (${chunkPlaceholders})`, chunk)
        dbApi.run(`DELETE FROM chat_message_reads WHERE user_id IN (${chunkPlaceholders})`, chunk)
        dbApi.run(`UPDATE chat_messages SET read_by_user_id = NULL WHERE read_by_user_id IN (${chunkPlaceholders})`, chunk)
        dbApi.run(`DELETE FROM chat_left_members WHERE user_id IN (${chunkPlaceholders})`, chunk)
        dbApi.run(`DELETE FROM chat_members WHERE user_id IN (${chunkPlaceholders})`, chunk)
        dbApi.run(`DELETE FROM users WHERE id IN (${chunkPlaceholders})`, chunk)
      })

      dbApi.run('COMMIT')

      const fileCleanup = removeStoredFiles(storedNames)
      dbApi.save()

      console.log(`Users deleted: ${userIds.length}`)
      console.log(`Stored files removed: ${fileCleanup.removed}`)
      console.log(`Stored files missing on disk: ${fileCleanup.missing}`)
    } catch (error) {
      dbApi.run('ROLLBACK')
      throw error
    }
  } finally {
    dbApi.close()
  }
}

await main()
