export const migration032AppSettings = {
  version: 32,
  up: ({ db, tableExists }) => {
    if (!tableExists("app_settings")) {
      db.run(`
        CREATE TABLE app_settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    }
  },
};
