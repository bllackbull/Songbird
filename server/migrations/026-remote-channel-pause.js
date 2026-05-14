export const migration026RemoteChannelPause = {
  name: "remote-channel-pause",
  version: 26,
  up: ({ db, hasColumn }) => {
    if (!hasColumn("remote_channel_sources", "paused")) {
      db.run(`
        ALTER TABLE remote_channel_sources 
        ADD COLUMN paused INTEGER NOT NULL DEFAULT 0
      `);
    }
  },
};
