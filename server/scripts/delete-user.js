import crypto from 'node:crypto'
import { confirmAction, getCliArgs, getPositionalArgs, hasForceYes, hasFlag } from './_cli.js'
import {
  openDatabase,
  removeStoredFiles,
  chunkArray,
  runAdminActionViaServer,
  detectRunningServer,
} from './_db-admin.js'
import { resolveUserRow } from '../lib/dbToolHelpers.js'

async function resolveUserIds(dbApi, selectors) {
  const ids = new Set()
  for (const selector of selectors) {
    const raw = String(selector || '').trim()
    if (!raw) continue
    const groupRow = await dbApi.getRow(
      "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username = ?",
      [raw],
    )
    if (groupRow?.id) {
      throw new Error(`Cannot delete user. "${raw}" is a group/channel username.`)
    }
    const userRow = await resolveUserRow(dbApi, raw)
    if (userRow?.id) {
      ids.add(String(userRow.id))
    }
  }
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
      userIds = await resolveUserIds(dbApi, selectors)
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
      const allRows = await dbApi.getAll('SELECT id FROM users ORDER BY id ASC')
      userIds = allRows
        .map((row) => String(row.id))
        .filter(Boolean)
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
        const remoteResult = await runAdminActionViaServer('delete_users', { selectors, all: hasAll })
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
    const ownerChatRows = await dbApi.getAll(
      `SELECT chat_id FROM chat_members WHERE role = 'owner' AND user_id IN (${placeholders})`,
      userIds,
    )
    const ownerChatIds = Array.from(
      new Set(ownerChatRows.map((row) => String(row?.chat_id || '')).filter(Boolean)),
    )
    const chatIdsToDelete = []
    const ownershipTransfers = []
    for (const chatId of ownerChatIds) {
      const remainingRows = await dbApi.getAll(
        `SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id NOT IN (${placeholders})`,
        [chatId, ...userIds],
      )
      const remaining = remainingRows
        .map((row) => String(row?.user_id || ''))
        .filter(Boolean)
      if (!remaining.length) {
        chatIdsToDelete.push(chatId)
        continue
      }
      const nextOwnerId = remaining[crypto.randomInt(remaining.length)]
      if (nextOwnerId) {
        ownershipTransfers.push({
          chatId,
          nextOwnerId,
        })
      }
    }
    const uniqueChatDeletes = Array.from(
      new Set(chatIdsToDelete.filter(Boolean)),
    )
    const chatPlaceholders = uniqueChatDeletes.map(() => '?').join(', ')
    const chatFileRows = uniqueChatDeletes.length
      ? await dbApi.getAll(
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

    const execute = async (dbLike) => {
      const queryRun = (sql, params = []) => dbLike.raw(sql, params)
      if (uniqueChatDeletes.length) {
        for (const chunk of chunkArray(uniqueChatDeletes, 500)) {
          const chunkPlaceholders = chunk.map(() => '?').join(', ')
          await queryRun(`DELETE FROM chat_message_reads WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders}))`, chunk)
          await queryRun(`DELETE FROM chat_message_files WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders}))`, chunk)
          await queryRun(`DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          await queryRun(`DELETE FROM chat_members WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          await queryRun(`DELETE FROM chat_left_members WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          await queryRun(`DELETE FROM chat_mutes WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          await queryRun(`DELETE FROM group_removed_members WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          await queryRun(`DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`, chunk)
          await queryRun(`DELETE FROM chats WHERE id IN (${chunkPlaceholders})`, chunk)
        }
      }
      for (const transfer of ownershipTransfers) {
        if (uniqueChatDeletes.includes(String(transfer.chatId)) || !transfer.chatId || !transfer.nextOwnerId) continue
        await queryRun('UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ?', ['owner', transfer.chatId, transfer.nextOwnerId])
      }
      for (const chunk of chunkArray(userIds, 500)) {
        const chunkPlaceholders = chunk.map(() => '?').join(', ')
        await queryRun(`DELETE FROM sessions WHERE user_id IN (${chunkPlaceholders})`, chunk)
        await queryRun(`DELETE FROM hidden_chats WHERE user_id IN (${chunkPlaceholders})`, chunk)
        await queryRun(`DELETE FROM chat_message_reads WHERE user_id IN (${chunkPlaceholders})`, chunk)
        await queryRun(`UPDATE chat_messages SET read_by_user_id = NULL WHERE read_by_user_id IN (${chunkPlaceholders})`, chunk)
        await queryRun(`DELETE FROM chat_left_members WHERE user_id IN (${chunkPlaceholders})`, chunk)
        await queryRun(`DELETE FROM chat_members WHERE user_id IN (${chunkPlaceholders})`, chunk)
        await queryRun(`DELETE FROM users WHERE id IN (${chunkPlaceholders})`, chunk)
      }
    }

    try {
      if (typeof dbApi.transaction === 'function' && process.env.DB_CLIENT?.toLowerCase() === 'postgres') {
        await dbApi.transaction(execute)
      } else {
        await dbApi.run('BEGIN')
        try {
          await execute({ raw: dbApi.run })
          await dbApi.run('COMMIT')
        } catch (error) {
          await dbApi.run('ROLLBACK')
          throw error
        }
      }

      const fileCleanup = removeStoredFiles(storedNames)
      await dbApi.save()

      console.log(`Users deleted: ${userIds.length}`)
      console.log(`Stored files removed: ${fileCleanup.removed}`)
      console.log(`Stored files missing on disk: ${fileCleanup.missing}`)
    } catch (error) {
      throw error
    }
  } finally {
    await dbApi.close()
  }
}

await main()
