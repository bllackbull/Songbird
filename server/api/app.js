import { readAppMeta } from "../lib/appMeta.js";

function registerAppRoutes(app, deps) {
  const { fs, path, projectRootDir } = deps;

  app.get("/api/app/info", (_req, res) => {
    const appMeta = readAppMeta({ fs, path, projectRootDir });
    res.json({
      version: appMeta.version,
      normalizedVersion: appMeta.normalizedVersion,
      changelog: appMeta.changelog,
      repository: appMeta.repository,
    });
  });
}

export { registerAppRoutes };
