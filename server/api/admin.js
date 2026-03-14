function registerAdminRoutes(app, deps) {
  const {
    adminGetAll,
    adminGetRow,
    adminRun,
    adminSave,
    chunkArray,
    isLoopbackRequest,
    removeAllMessageUploads,
    removeStoredFileNames,
    buildInspectSnapshot,
    buildTimestampSchedule,
    avatarUploadRootDir,
    fs,
    path,
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

          const row = adminGetRow("SELECT id FROM users WHERE username = ?", [
            raw,
          ]);

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
        const fileRows = adminGetAll(
          `SELECT cmf.stored_name
           FROM chat_message_files cmf
           JOIN chat_messages cm ON cm.id = cmf.message_id
           WHERE cm.user_id IN (${userPlaceholders})`,
          userIds,
        );
        const storedNames = fileRows.map((row) => row.stored_name);

        adminRun("BEGIN");
        try {
          chunkArray(userIds, 500).forEach((chunk) => {
            const chunkPlaceholders = chunk.map(() => "?").join(", ");

            adminRun(
              `DELETE FROM chat_message_files WHERE message_id IN (
                SELECT id FROM chat_messages WHERE user_id IN (${chunkPlaceholders})
              )`,
              chunk,
            );

            adminRun(
              `DELETE FROM chat_messages WHERE user_id IN (${chunkPlaceholders})`,
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

            const orphanRows = adminGetAll(
              `SELECT id
               FROM chats
               WHERE type != 'dm' AND id NOT IN (SELECT chat_id FROM chat_members)`,
            );
            const orphanChatIds = orphanRows
              .map((row) => Number(row.id))
              .filter((id) => Number.isFinite(id) && id > 0);

            if (orphanChatIds.length) {
              chunkArray(orphanChatIds, 500).forEach((orphanChunk) => {
                const orphanPlaceholders = orphanChunk.map(() => "?").join(", ");

                adminRun(
                  `DELETE FROM chat_message_files WHERE message_id IN (
                    SELECT id FROM chat_messages WHERE chat_id IN (${orphanPlaceholders})
                  )`,
                  orphanChunk,
                );

                adminRun(
                  `DELETE FROM chat_messages WHERE chat_id IN (${orphanPlaceholders})`,
                  orphanChunk,
                );

                adminRun(
                  `DELETE FROM hidden_chats WHERE chat_id IN (${orphanPlaceholders})`,
                  orphanChunk,
                );

                adminRun(
                  `DELETE FROM chats WHERE id IN (${orphanPlaceholders})`,
                  orphanChunk,
                );
              });
            }
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
          },
        });
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

        if (deleteAll) {
          targetMessageIds = adminGetAll(
            "SELECT DISTINCT message_id FROM chat_message_files ORDER BY message_id ASC",
          )
            .map((row) => Number(row.message_id))
            .filter((id) => Number.isFinite(id) && id > 0);

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
