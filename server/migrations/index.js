import { migration001InitialSchema } from './001-initial-schema.js'
import { migration002LegacyChatRename } from './002-legacy-chat-rename.js'
import { migration003MessageFiles } from './003-message-files.js'

export const migrations = [migration001InitialSchema, migration002LegacyChatRename, migration003MessageFiles]
