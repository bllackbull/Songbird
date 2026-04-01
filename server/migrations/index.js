import { migration001InitialSchema } from "./001-initial-schema.js";
import { migration002LegacyChatRename } from "./002-legacy-chat-rename.js";
import { migration003MessageFiles } from "./003-message-files.js";
import { migration004MessageFileMetadata } from "./004-message-file-metadata.js";
import { migration005DmDefaultName } from "./005-dm-default-name.js";
import { migration006MessageFileExpiry } from "./006-message-file-expiry.js";
import { migration007MessageReplies } from "./007-message-replies.js";
import { migration008GroupInvites } from "./008-group-invites.js";
import { migration009GroupColor } from "./009-group-color.js";
import { migration010GroupSettings } from "./010-group-settings.js";
import { migration011ChatMutes } from "./011-chat-mutes.js";
import { migration012GroupRemovedMembers } from "./012-group-removed-members.js";
import { migration013MessageReads } from "./013-message-reads.js";
import { migration as migration014PushSubscriptions } from "./014-push-subscriptions.js";

export const migrations = [
  migration001InitialSchema,
  migration002LegacyChatRename,
  migration003MessageFiles,
  migration004MessageFileMetadata,
  migration005DmDefaultName,
  migration006MessageFileExpiry,
  migration007MessageReplies,
  migration008GroupInvites,
  migration009GroupColor,
  migration010GroupSettings,
  migration011ChatMutes,
  migration012GroupRemovedMembers,
  migration013MessageReads,
  migration014PushSubscriptions,
];
