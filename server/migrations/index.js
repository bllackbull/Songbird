import { migration001InitialSchema } from './001-initial-schema.js'
import { migration002LegacyChatRename } from './002-legacy-chat-rename.js'
import { migration003MessageFiles } from './003-message-files.js'
import { migration004MessageFileMetadata } from './004-message-file-metadata.js'
import { migration005DmDefaultName } from './005-dm-default-name.js'
import { migration006MessageFileExpiry } from './006-message-file-expiry.js'

export const migrations = [
  migration001InitialSchema,
  migration002LegacyChatRename,
  migration003MessageFiles,
  migration004MessageFileMetadata,
  migration005DmDefaultName,
  migration006MessageFileExpiry,
]
