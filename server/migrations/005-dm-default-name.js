export const migration005DmDefaultName = {
  version: 5,
  up: ({ db, tableExists }) => {
    if (!tableExists('chats')) return
    db.run(`
      UPDATE chats
      SET name = 'dm'
      WHERE type = 'dm' AND (name IS NULL OR TRIM(name) = '')
    `)
  },
}
