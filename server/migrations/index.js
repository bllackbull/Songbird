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
import { migration015RemoveIdleStatus } from "./015-remove-idle-status.js";
import { migration016UserBans } from "./016-user-bans.js";
import { migration017MessageEditsAndHides } from "./017-message-edits-and-hides.js";
import { migration018MessageForwarding } from "./018-message-forwarding.js";
import { migration019MessageForwardOriginUsers } from "./019-message-forward-origin-users.js";
import { migration020ChatMessageExpiry } from "./020-chat-message-expiry.js";
import { migration021ChatQueryIndexes } from "./021-chat-query-indexes.js";
import { migration022MessageClientRequestId } from "./022-message-client-request-id.js";
import { migration023ChatLeftMembers } from "./023-chat-left-members.js";

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
  migration015RemoveIdleStatus,
  migration016UserBans,
  migration017MessageEditsAndHides,
  migration018MessageForwarding,
  migration019MessageForwardOriginUsers,
  migration020ChatMessageExpiry,
  migration021ChatQueryIndexes,
  migration022MessageClientRequestId,
  migration023ChatLeftMembers,
];
