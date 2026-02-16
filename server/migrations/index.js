import { migration001InitialSchema } from './001-initial-schema.js'
import { migration002LegacyChatRename } from './002-legacy-chat-rename.js'
import { migration003MailSystem } from './003-mail-system.js'
import { migration004MailSenderTrash } from './004-mail-sender-trash.js'

export const migrations = [
  migration001InitialSchema,
  migration002LegacyChatRename,
  migration003MailSystem,
  migration004MailSenderTrash,
]
