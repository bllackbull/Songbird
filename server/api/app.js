import { readAppMeta } from "../lib/appMeta.js";

function registerAppRoutes(app, deps) {
  const { REMOTE_CHANNELS, getSetting, fs, path, projectRootDir } = deps;

  app.get("/api/app/info", (_req, res) => {
    const appMeta = readAppMeta({ fs, path, projectRootDir });
    res.json({
      version: appMeta.version,
      normalizedVersion: appMeta.normalizedVersion,
      changelog: appMeta.changelog,
      changelogSections: appMeta.changelogSections,
      currentChangelog: appMeta.currentChangelog,
      repository: appMeta.repository,
      // Live runtime config the client needs before it can render auth/chat
      // UI correctly. Read via getSetting() on every request so admin-panel
      // changes take effect immediately, without a client rebuild or reload
      // being required beyond a normal page fetch.
      accountCreationEnabled: Boolean(getSetting("SIGN_UP")),
      adminPanelEnabled: !["0", "false", "no", "n", "off"].includes(
        String(process.env.ADMIN_PANEL ?? "true").trim().toLowerCase(),
      ),
      messageMaxChars: Number(getSetting("MESSAGE_MAX_CHARS")) || 4000,
      usernameMaxChars: Number(getSetting("USERNAME_MAX_CHARS")) || 16,
      nicknameMaxChars: Number(getSetting("NICKNAME_MAX_CHARS")) || 24,
      fileUploadEnabled: Boolean(getSetting("FILE_UPLOAD")),
      chatMessageFetchLimit: Number(getSetting("CHAT_MESSAGE_FETCH_LIMIT")) || 60,
      chatMessagePageSize: Number(getSetting("CHAT_MESSAGE_PAGE_SIZE")) || 60,
      chatCacheTtlHours: Number(getSetting("CHAT_CACHE_TTL")) || 24,
      remoteChannels: {
        // enabled/telegramConfigured/proxyConfigured stay restart-scoped
        // (Telegram credentials + remoteChannelManager are wired once at
        // startup), but uiEnabled/mediaStreamEnabled are pure display flags
        // read live so toggling them in the admin panel applies immediately.
        enabled: Boolean(REMOTE_CHANNELS?.enabled),
        uiEnabled: Boolean(getSetting("REMOTE_CHANNEL_UI")),
        mediaStreamEnabled: Boolean(getSetting("REMOTE_CHANNEL_MEDIA_STREAM")),
        telegramConfigured: Boolean(REMOTE_CHANNELS?.telegramConfigured),
        songbirdConfigured: Boolean(REMOTE_CHANNELS?.enabled),
        proxyConfigured: Boolean(REMOTE_CHANNELS?.proxyConfigured),
      },
    });
  });
}

export { registerAppRoutes };
