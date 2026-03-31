function registerAdminRoutes(app, deps) {
  const {
    adminGetAll,
    adminGetRow,
    adminRun,
    adminSave,
    chunkArray,
    bcrypt,
    setUserColor,
    NICKNAME_MAX,
    USERNAME_MAX,
    MESSAGE_MAX_CHARS,
    USERNAME_REGEX,
    isLoopbackRequest,
    removeAllMessageUploads,
    removeStoredFileNames,
    buildInspectSnapshot,
    buildTimestampSchedule,
    avatarUploadRootDir,
    fs,
    path,
    emitChatEvent,
  } = deps;

  app.post("/api/admin/db-tools", async (req, res) => {
    if (!isLoopbackRequest(req)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const expectedToken = process.env.ADMIN_API_TOKEN;

    if (expectedToken) {
      const provided = String(req.headers["x-songbird-admin-token"] || "");

      if (!provided || provided !== expectedToken) {
        return res.status(401).json({ error: "Invalid admin token." });
      }
    }

    const action = String(req.body?.action || "")
      .trim()
      .toLowerCase();
    const payload = req.body?.payload || {};

    try {
      if (action === "delete_chats") {
        let chatIds = Array.isArray(payload.chatIds)
          ? payload.chatIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id) && id > 0)
          : [];
        if (!chatIds.length) {
          chatIds = adminGetAll("SELECT id FROM chats ORDER BY id ASC")
            .map((row) => Number(row.id))
            .filter((id) => Number.isFinite(id) && id > 0);
        }

        if (!chatIds.length) {
          return res.json({
            ok: true,
            result: { removedChats: 0, removedFiles: 0 },
          });
        }

        const placeholders = chatIds.map(() => "?").join(", ");
        const fileRows = adminGetAll(
          `SELECT cmf.stored_name
           FROM chat_message_files cmf
           JOIN chat_messages cm ON cm.id = cmf.message_id
           WHERE cm.chat_id IN (${placeholders})`,
          chatIds,
        );
        const storedNames = fileRows.map((row) => row.stored_name);

        adminRun("BEGIN");
        try {
          chunkArray(chatIds, 500).forEach((chunk) => {
            const chunkPlaceholders = chunk.map(() => "?").join(", ");

            adminRun(
              `DELETE FROM chat_message_reads WHERE message_id IN (
                SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
              )`,
              chunk,
            );

            adminRun(
              `DELETE FROM chat_message_files WHERE message_id IN (
                SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
              )`,
              chunk,
            );

            adminRun(
              `DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM chat_members WHERE chat_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM chat_mutes WHERE chat_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM group_removed_members WHERE chat_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM chats WHERE id IN (${chunkPlaceholders})`,
              chunk,
            );
          });

          adminRun("COMMIT");
        } catch (error) {
          adminRun("ROLLBACK");
          throw error;
        }

        removeStoredFileNames(storedNames);
        adminSave();

        return res.json({
          ok: true,
          result: {
            removedChats: chatIds.length,
            removedFiles: storedNames.length,
          },
        });
      }

      if (action === "delete_users") {
        const selectors = Array.isArray(payload.selectors)
          ? payload.selectors
          : [];

        let userIds = [];

        selectors.forEach((selector) => {
          const raw = String(selector || "").trim();
          if (!raw) return;

          const numeric = Number(raw);

          if (Number.isFinite(numeric) && numeric > 0) {
            userIds.push(Math.trunc(numeric));
            return;
          }

          const groupRow = adminGetRow(
            "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username = ?",
            [raw],
          );
          if (groupRow?.id) {
            throw new Error(`Cannot delete user. "${raw}" is a group/channel username.`);
          }

          const row = adminGetRow("SELECT id FROM users WHERE username = ?", [raw]);

          if (row?.id) userIds.push(Number(row.id));
        });

        if (!userIds.length) {
          userIds = adminGetAll("SELECT id FROM users ORDER BY id ASC")
            .map((row) => Number(row.id))
            .filter((id) => Number.isFinite(id) && id > 0);
        }

        userIds = Array.from(new Set(userIds));

        if (!userIds.length) {
          return res.json({
            ok: true,
            result: { removedUsers: 0, removedFiles: 0, removedChats: 0 },
          });
        }

        const userPlaceholders = userIds.map(() => "?").join(", ");
        const ownerChatRows = adminGetAll(
          `SELECT chat_id FROM chat_members WHERE role = 'owner' AND user_id IN (${userPlaceholders})`,
          userIds,
        );
        const ownerChatIds = Array.from(
          new Set(ownerChatRows.map((row) => Number(row?.chat_id || 0)).filter(Boolean)),
        );
        const chatIdsToDelete = [];
        const ownershipTransfers = [];
        ownerChatIds.forEach((chatId) => {
          const remaining = adminGetAll(
            `SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id NOT IN (${userPlaceholders})`,
            [Number(chatId), ...userIds],
          )
            .map((row) => Number(row?.user_id || 0))
            .filter((id) => Number.isFinite(id) && id > 0);
          if (!remaining.length) {
            chatIdsToDelete.push(Number(chatId));
            return;
          }
          const nextOwnerId =
            remaining[Math.floor(Math.random() * remaining.length)];
          if (nextOwnerId) {
            ownershipTransfers.push({
              chatId: Number(chatId),
              nextOwnerId: Number(nextOwnerId),
            });
          }
        });
        const uniqueChatDeletes = Array.from(
          new Set(chatIdsToDelete.filter((id) => Number.isFinite(id) && id > 0)),
        );
        const chatDeletePlaceholders = uniqueChatDeletes.map(() => "?").join(", ");
        const chatStoredRows = uniqueChatDeletes.length
          ? adminGetAll(
              `SELECT cmf.stored_name
               FROM chat_message_files cmf
               JOIN chat_messages cm ON cm.id = cmf.message_id
               WHERE cm.chat_id IN (${chatDeletePlaceholders})`,
              uniqueChatDeletes,
            )
          : [];
        const storedNames = Array.from(
          new Set(
            [...chatStoredRows]
              .map((row) => String(row?.stored_name || "").trim())
              .filter(Boolean),
          ),
        );

        adminRun("BEGIN");
        try {
          if (uniqueChatDeletes.length) {
            chunkArray(uniqueChatDeletes, 500).forEach((chunk) => {
              const chunkPlaceholders = chunk.map(() => "?").join(", ");
              adminRun(
                `DELETE FROM chat_message_reads WHERE message_id IN (
                  SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
                )`,
                chunk,
              );
              adminRun(
                `DELETE FROM chat_message_files WHERE message_id IN (
                  SELECT id FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})
                )`,
                chunk,
              );
              adminRun(
                `DELETE FROM chat_messages WHERE chat_id IN (${chunkPlaceholders})`,
                chunk,
              );
              adminRun(
                `DELETE FROM chat_members WHERE chat_id IN (${chunkPlaceholders})`,
                chunk,
              );
              adminRun(
                `DELETE FROM chat_mutes WHERE chat_id IN (${chunkPlaceholders})`,
                chunk,
              );
              adminRun(
                `DELETE FROM group_removed_members WHERE chat_id IN (${chunkPlaceholders})`,
                chunk,
              );
              adminRun(
                `DELETE FROM hidden_chats WHERE chat_id IN (${chunkPlaceholders})`,
                chunk,
              );
              adminRun(
                `DELETE FROM chats WHERE id IN (${chunkPlaceholders})`,
                chunk,
              );
            });
          }
          ownershipTransfers.forEach((transfer) => {
            if (
              uniqueChatDeletes.includes(Number(transfer.chatId)) ||
              !transfer.chatId ||
              !transfer.nextOwnerId
            ) {
              return;
            }
            adminRun(
              `UPDATE chat_members SET role = 'owner' WHERE chat_id = ? AND user_id = ?`,
              [Number(transfer.chatId), Number(transfer.nextOwnerId)],
            );
          });
          chunkArray(userIds, 500).forEach((chunk) => {
            const chunkPlaceholders = chunk.map(() => "?").join(", ");

            adminRun(
              `DELETE FROM chat_message_reads WHERE user_id IN (${chunkPlaceholders})`,
              chunk,
            );
            adminRun(
              `UPDATE chat_messages SET read_by_user_id = NULL WHERE read_by_user_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM chat_members WHERE user_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM sessions WHERE user_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM hidden_chats WHERE user_id IN (${chunkPlaceholders})`,
              chunk,
            );

            adminRun(
              `DELETE FROM users WHERE id IN (${chunkPlaceholders})`,
              chunk,
            );

          });

          adminRun("COMMIT");
        } catch (error) {
          adminRun("ROLLBACK");
          throw error;
        }

        removeStoredFileNames(storedNames);
        adminSave();

        return res.json({
          ok: true,
          result: {
            removedUsers: userIds.length,
            removedFiles: storedNames.length,
            removedChats: uniqueChatDeletes.length,
          },
        });
      }

      if (action === "create_user") {
        const rawUsername = String(payload.username || "").trim().toLowerCase();
        const nickname = String(payload.nickname || "").trim();
        const password = String(payload.password || "");

        if (!rawUsername || !password) {
          return res.status(400).json({ error: "Username and password are required." });
        }
        if (rawUsername.length < 3) {
          return res.status(400).json({ error: "Username must be at least 3 characters." });
        }
        if (USERNAME_MAX && rawUsername.length > USERNAME_MAX) {
          return res.status(400).json({
            error: `Username must be at most ${USERNAME_MAX} characters.`,
          });
        }
        if (nickname && nickname.length > (NICKNAME_MAX || 0)) {
          return res.status(400).json({
            error: `Nickname must be at most ${NICKNAME_MAX} characters.`,
          });
        }

        if (USERNAME_REGEX && !USERNAME_REGEX.test(rawUsername)) {
          return res
            .status(400)
            .json({ error: "Invalid username. Allowed: lowercase english letters, numbers, ., _" });
        }

        const exists = adminGetRow("SELECT id FROM users WHERE username = ?", [
          rawUsername,
        ]);
        if (exists?.id) {
          return res.status(409).json({ error: "Username already exists." });
        }
        const groupExists = adminGetRow(
          "SELECT id FROM chats WHERE type IN ('group', 'channel') AND group_username = ?",
          [rawUsername],
        );
        if (groupExists?.id) {
          return res.status(409).json({ error: "Username already exists." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const assignedColor = setUserColor ? setUserColor() : null;
        adminRun(
          `INSERT INTO users (username, nickname, avatar_url, color, status, password_hash, created_at, last_seen)
           VALUES (?, ?, NULL, ?, ?, ?, datetime('now'), datetime('now'))`,
          [rawUsername, nickname || rawUsername, assignedColor, "online", passwordHash],
        );
        adminSave();

        const row = adminGetRow(
          "SELECT id, username, nickname FROM users WHERE username = ?",
          [rawUsername],
        );

        return res.json({
          ok: true,
          result: {
            id: row?.id,
            username: row?.username,
            nickname: row?.nickname,
          },
        });
      }

      if (action === "generate_users") {
        const count = Math.max(
          1,
          Math.min(5000, Number(payload.count || 0) || 0),
        );
        const password = String(payload.password || "");
        const nicknamePrefix = String(payload.nicknamePrefix || "User");
        const usernamePrefix = String(payload.usernamePrefix || "user");
        const maxUsername = Math.max(3, Number(USERNAME_MAX || 16));
        const maxNickname = Math.max(3, Number(NICKNAME_MAX || 24));
        const maxPrefixLen = Math.max(1, maxUsername - 2);
        const clampPrefix = (value, maxLen) => {
          const trimmed = String(value || "").trim();
          if (!trimmed) return "";
          return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
        };

        if (!count || !password) {
          return res
            .status(400)
            .json({ error: "Count and password are required." });
        }

        const existingRows = adminGetAll("SELECT username FROM users");
        const existingGroups = adminGetAll(
          "SELECT group_username FROM chats WHERE type IN ('group', 'channel') AND group_username IS NOT NULL",
        );
        const usedUsernames = new Set(
          existingRows.map((row) => String(row.username || "").toLowerCase()),
        );
        existingGroups.forEach((row) => {
          const value = String(row.group_username || "").toLowerCase();
          if (value) usedUsernames.add(value);
        });
        const passwordHash = bcrypt.hashSync(password, 10);

        const randomToken = (length = 6) => {
          const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
          let output = "";
          for (let i = 0; i < length; i += 1) {
            output += chars[Math.floor(Math.random() * chars.length)];
          }
          return output;
        };

        let created = 0;
        adminRun("BEGIN");
        try {
          for (let i = 0; i < count; i += 1) {
            let username = "";
            do {
              const basePrefix = clampPrefix(usernamePrefix, maxPrefixLen);
              const safePrefix =
                basePrefix.length >= 1 ? basePrefix : clampPrefix("user", maxPrefixLen);
              const tokenBudget = Math.max(1, maxUsername - safePrefix.length - 1);
              const token = randomToken(Math.min(12, tokenBudget));
              username = `${safePrefix}_${token}`.toLowerCase().slice(0, maxUsername);
            } while (usedUsernames.has(username));
            usedUsernames.add(username);
            const rawNickname = `${nicknamePrefix} ${created + 1}`;
            const nickname =
              rawNickname.length > maxNickname
                ? rawNickname.slice(0, maxNickname)
                : rawNickname;
            const assignedColor = setUserColor ? setUserColor() : null;
            adminRun(
              "INSERT INTO users (username, nickname, avatar_url, color, status, password_hash, created_at, last_seen) VALUES (?, ?, NULL, ?, ?, ?, datetime('now'), datetime('now'))",
              [username, nickname, assignedColor, "online", passwordHash],
            );
            created += 1;
          }
          adminRun("COMMIT");
        } catch (error) {
          adminRun("ROLLBACK");
          throw error;
        }

        adminSave();
        return res.json({ ok: true, result: { created } });
      }

      if (action === "generate_chat_messages") {
        const chatId = Number(payload.chatId || 0);
        const userA = String(payload.userA || "").trim();
        const userB = String(payload.userB || "").trim();
        const count = Math.max(1, Math.min(10000, Number(payload.count || 0) || 0));
        const daysBack = Math.max(1, Math.min(365, Number(payload.days || 7) || 7));

        if (!chatId || !userA || !userB || !count) {
          return res.status(400).json({
            error:
              "Usage: chatId, userA, userB, count, days are required.",
          });
        }

        const chatRow = adminGetRow("SELECT id FROM chats WHERE id = ?", [chatId]);
        if (!chatRow?.id) {
          return res.status(404).json({ error: "Chat not found." });
        }

        const resolveUserId = (raw) => {
          const numeric = Number(raw);
          if (Number.isFinite(numeric) && numeric > 0) {
            const row = adminGetRow("SELECT id FROM users WHERE id = ?", [numeric]);
            return row?.id ? Number(row.id) : null;
          }
          const row = adminGetRow("SELECT id FROM users WHERE username = ?", [
            String(raw || "").toLowerCase(),
          ]);
          return row?.id ? Number(row.id) : null;
        };

        const userAId = resolveUserId(userA);
        const userBId = resolveUserId(userB);
        if (!userAId || !userBId) {
          return res.status(404).json({ error: "One or both users not found." });
        }
        if (userAId === userBId) {
          return res.status(400).json({ error: "userA and userB must be different users." });
        }

        const sampleMessages = [
          "Hello there",
          "How are you doing?",
          "Sounds good",
          "I will check and reply",
          "Can you send details?",
          "Sure, one second",
          "Thanks",
          "Got it",
          "Let us do it",
          "Looks great",
          "See you soon",
          "On my way",
          "Please review this",
          "Done",
          "Perfect",
        ];
        const maxMessageChars = Math.max(1, Number(MESSAGE_MAX_CHARS || 4000));
        const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const buildTimestampSchedule = (totalCount, days) => {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const nowSecondsOfDay =
            now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
          const startDay = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
          );
          startDay.setDate(startDay.getDate() - (days - 1));

          const perDay = new Array(days).fill(0);
          for (let i = 0; i < totalCount; i += 1) {
            perDay[i % days] += 1;
          }

          const stamps = [];
          for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
            const messagesInDay = perDay[dayIndex];
            if (!messagesInDay) continue;
            const dayStart = new Date(startDay);
            dayStart.setDate(startDay.getDate() + dayIndex);
            const isToday =
              dayStart.getFullYear() === today.getFullYear() &&
              dayStart.getMonth() === today.getMonth() &&
              dayStart.getDate() === today.getDate();
            const maxSecondOfDay = isToday
              ? Math.max(0, Math.min(86399, nowSecondsOfDay))
              : 86399;
            const seconds = [];
            for (let i = 0; i < messagesInDay; i += 1) {
              const secondOfDay = Math.floor(Math.random() * (maxSecondOfDay + 1));
              seconds.push(secondOfDay);
            }
            seconds.sort((a, b) => a - b);
            for (let i = 0; i < seconds.length; i += 1) {
              stamps.push(
                new Date(dayStart.getTime() + seconds[i] * 1000).toISOString(),
              );
            }
          }
          return stamps;
        };

        adminRun("BEGIN");
        try {
          adminRun(
            "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
            [chatId, userAId, "member"],
          );
          adminRun(
            "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
            [chatId, userBId, "member"],
          );

          const timestamps = buildTimestampSchedule(count, daysBack);
          for (let index = 0; index < count; index += 1) {
            const senderId = index % 2 === 0 ? userAId : userBId;
            const rawBody = `${pickRandom(sampleMessages)} #${index + 1}`;
            const body =
              rawBody.length > maxMessageChars
                ? rawBody.slice(0, maxMessageChars)
                : rawBody;
            adminRun(
              "INSERT INTO chat_messages (chat_id, user_id, body, created_at, read_at, read_by_user_id) VALUES (?, ?, ?, ?, NULL, NULL)",
              [chatId, senderId, body, timestamps[index]],
            );
          }

          adminRun("COMMIT");
        } catch (error) {
          adminRun("ROLLBACK");
          throw error;
        }

        adminSave();
        return res.json({ ok: true, result: { created: count, chatId } });
      }

      if (action === "create_demo") {
        const payloadChatId = Number(payload.chatId || 0);
        const count = Number(payload.count || 15);
        const daysBack = Number(payload.daysBack || 5);
        const allowRecreate = Boolean(payload.allowRecreate);

        const userRow = adminGetRow(
          `SELECT id FROM users WHERE username = ?`,
          ["demo"],
        );

        let userId = Number(userRow?.id || 0);
        if (!userId) {
          adminRun(
            `INSERT INTO users (username, password_hash, nickname, status, color, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            ["demo", "demo", "Demo User", "online", "#10b981"],
          );
          userId = Number(
            adminGetRow("SELECT id FROM users WHERE username = ?", ["demo"])
              ?.id || 0,
          );
        }

        let chatId = payloadChatId;
        if (!chatId) {
          const row = adminGetRow(
            `SELECT id FROM chats WHERE name = ? ORDER BY id ASC LIMIT 1`,
            ["Songbird Demo"],
          );
          chatId = Number(row?.id || 0);
        }

        if (!chatId) {
          adminRun(
            `INSERT INTO chats (name, type, created_at)
             VALUES (?, ?, datetime('now'))`,
            ["Songbird Demo", "group"],
          );

          chatId = Number(
            adminGetRow("SELECT id FROM chats WHERE name = ?", [
              "Songbird Demo",
            ])?.id || 0,
          );
        }

        const memberRow = adminGetRow(
          `SELECT id FROM chat_members WHERE chat_id = ? AND user_id = ?`,
          [chatId, userId],
        );

        if (!memberRow?.id) {
          adminRun(
            `INSERT INTO chat_members (chat_id, user_id, role)
             VALUES (?, ?, ?)`,
            [chatId, userId, "owner"],
          );
        }

        if (!allowRecreate) {
          const exists = adminGetRow(
            `SELECT id FROM chat_messages WHERE chat_id = ? LIMIT 1`,
            [chatId],
          );
          if (exists?.id) {
            adminSave();
            return res.json({
              ok: true,
              result: {
                created: 0,
                chatId,
              },
            });
          }
        }

        const timestampSchedule = buildTimestampSchedule(count, daysBack);

        let created = 0;
        adminRun("BEGIN");
        try {
          timestampSchedule.forEach((stamp, index) => {
            adminRun(
              `INSERT INTO chat_messages (chat_id, user_id, body, created_at)
               VALUES (?, ?, ?, ?)`,
              [chatId, userId, `Demo message ${index + 1}`, stamp],
            );
            created += 1;
          });
          adminRun("COMMIT");
        } catch (error) {
          adminRun("ROLLBACK");
          throw error;
        }

        adminSave();

        return res.json({ ok: true, result: { created, chatId } });
      }

      if (action === "inspect_db") {
        const kind = String(payload.kind || "all").toLowerCase();
        const limit = Math.max(
          1,
          Math.min(1000, Number(payload.limit || 25) || 25),
        );
        return res.json({
          ok: true,
          result: buildInspectSnapshot(kind, limit),
        });
      }

      if (action === "delete_files") {
        const selectors = Array.isArray(payload.selectors)
          ? payload.selectors
              .map((value) => String(value || "").trim())
              .filter(Boolean)
          : [];
        const deleteAll = selectors.length === 0;

        let targetMessageIds = [];
        let messageStoredNames = [];
        let targetAvatarUsers = [];
        let messageChatPairs = [];

        if (deleteAll) {
          targetMessageIds = adminGetAll(
            "SELECT DISTINCT message_id FROM chat_message_files ORDER BY message_id ASC",
          )
            .map((row) => Number(row.message_id))
            .filter((id) => Number.isFinite(id) && id > 0);

          if (targetMessageIds.length) {
            messageChatPairs = adminGetAll(
              `SELECT id, chat_id FROM chat_messages WHERE id IN (${targetMessageIds
                .map(() => "?")
                .join(", ")})`,
              targetMessageIds,
            ).map((row) => ({
              id: Number(row.id),
              chatId: Number(row.chat_id),
            }));
          }

          messageStoredNames = adminGetAll(
            "SELECT stored_name FROM chat_message_files",
          ).map((row) => row.stored_name);

          targetAvatarUsers = adminGetAll(
            `SELECT id, avatar_url
             FROM users
             WHERE avatar_url LIKE '/uploads/avatars/%'
                OR avatar_url LIKE '/api/uploads/avatars/%'`,
          );
        } else {
          const numericIds = selectors
            .map((value) => Number(value))
            .filter((id) => Number.isFinite(id) && id > 0);
          const named = selectors
            .map((value) => path.basename(value))
            .filter(Boolean);

          const byIdRows = numericIds.length
            ? adminGetAll(
                `SELECT id, message_id, stored_name FROM chat_message_files WHERE id IN (${numericIds
                  .map(() => "?")
                  .join(", ")})`,
                numericIds,
              )
            : [];

          const byNameRows = named.length
            ? adminGetAll(
                `SELECT id, message_id, stored_name FROM chat_message_files WHERE stored_name IN (${named
                  .map(() => "?")
                  .join(", ")})`,
                named,
              )
            : [];

          const fileRows = [...byIdRows, ...byNameRows];

          targetMessageIds = Array.from(
            new Set(
              fileRows
                .map((row) => Number(row.message_id))
                .filter((id) => Number.isFinite(id) && id > 0),
            ),
          );

          if (targetMessageIds.length) {
            messageChatPairs = adminGetAll(
              `SELECT id, chat_id FROM chat_messages WHERE id IN (${targetMessageIds
                .map(() => "?")
                .join(", ")})`,
              targetMessageIds,
            ).map((row) => ({
              id: Number(row.id),
              chatId: Number(row.chat_id),
            }));
            messageStoredNames = adminGetAll(
              `SELECT stored_name FROM chat_message_files WHERE message_id IN (${targetMessageIds
                .map(() => "?")
                .join(", ")})`,
              targetMessageIds,
            ).map((row) => row.stored_name);
          }

          if (named.length) {
            targetAvatarUsers = adminGetAll(
              `SELECT id, avatar_url
               FROM users
               WHERE avatar_url LIKE '/uploads/avatars/%'
                  OR avatar_url LIKE '/api/uploads/avatars/%'`,
            ).filter((row) =>
              named.includes(path.basename(String(row.avatar_url || ""))),
            );
          }
        }

        adminRun("BEGIN");
        try {
          if (targetMessageIds.length) {
            chunkArray(targetMessageIds, 500).forEach((chunk) => {
              const placeholders = chunk.map(() => "?").join(", ");

              adminRun(
                `DELETE FROM chat_message_files WHERE message_id IN (${placeholders})`,
                chunk,
              );

              adminRun(
                `DELETE FROM chat_messages WHERE id IN (${placeholders})`,
                chunk,
              );
            });
          }
          if (targetAvatarUsers.length) {
            chunkArray(
              targetAvatarUsers.map((row) => Number(row.id)).filter(Boolean),
              500,
            ).forEach((chunk) => {
              const placeholders = chunk.map(() => "?").join(", ");

              adminRun(
                `UPDATE users SET avatar_url = NULL WHERE id IN (${placeholders})`,
                chunk,
              );
            });
          }
          adminRun("COMMIT");
        } catch (error) {
          adminRun("ROLLBACK");
          throw error;
        }

        removeStoredFileNames(messageStoredNames);
        const avatarNames = targetAvatarUsers.map((row) =>
          path.basename(String(row.avatar_url || "").trim()),
        );

        avatarNames.forEach((name) => {
          try {
            const filePath = path.join(avatarUploadRootDir, name);

            if (name && fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (_) {
            // best effort cleanup
          }
        });

        adminSave();

        if (messageChatPairs.length) {
          const chatToMessageIds = new Map();
          messageChatPairs.forEach((pair) => {
            if (!Number.isFinite(pair.chatId) || !Number.isFinite(pair.id)) return;
            const list = chatToMessageIds.get(pair.chatId) || [];
            list.push(pair.id);
            chatToMessageIds.set(pair.chatId, list);
          });
          chatToMessageIds.forEach((messageIds, chatId) => {
            emitChatEvent(Number(chatId), {
              type: "chat_message_deleted",
              chatId: Number(chatId),
              messageIds,
            });
          });
        }

        return res.json({
          ok: true,
          result: {
            removedMessages: targetMessageIds.length,
            removedMessageFiles: messageStoredNames.length,
            removedAvatars: targetAvatarUsers.length,
          },
        });
      }

      if (action === "reset_db" || action === "delete_db") {
        adminRun("BEGIN");

        try {
          adminRun("DELETE FROM chat_message_files");
          adminRun("DELETE FROM chat_messages");
          adminRun("DELETE FROM hidden_chats");
          adminRun("DELETE FROM chat_members");
          adminRun("DELETE FROM chats");
          adminRun("DELETE FROM sessions");
          adminRun("DELETE FROM users");
          adminRun("COMMIT");
        } catch (error) {
          adminRun("ROLLBACK");
          throw error;
        }

        removeAllMessageUploads();
        adminSave();

        return res.json({ ok: true, result: { cleared: true } });
      }

      return res.status(400).json({ error: "Unknown admin action." });
    } catch (error) {
      return res
        .status(500)
        .json({ error: error?.message || "Admin action failed." });
    }
  });
}

export { registerAdminRoutes };
