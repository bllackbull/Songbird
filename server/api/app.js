import { readAppMeta } from "../lib/appMeta.js";

function registerAppRoutes(app, deps) {
  const { REMOTE_CHANNELS, fs, path, projectRootDir } = deps;

  app.get("/api/app/info", (_req, res) => {
    const appMeta = readAppMeta({ fs, path, projectRootDir });
    res.json({
      version: appMeta.version,
      normalizedVersion: appMeta.normalizedVersion,
      changelog: appMeta.changelog,
      changelogSections: appMeta.changelogSections,
      currentChangelog: appMeta.currentChangelog,
      repository: appMeta.repository,
      remoteChannels: {
        enabled: Boolean(
          REMOTE_CHANNELS?.enabled && REMOTE_CHANNELS?.telegramConfigured,
        ),
        telegramConfigured: Boolean(REMOTE_CHANNELS?.telegramConfigured),
        proxyConfigured: Boolean(REMOTE_CHANNELS?.proxyConfigured),
      },
    });
  });
}

export { registerAppRoutes };
