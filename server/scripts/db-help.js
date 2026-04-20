const helpText = `
Songbird DB Commands

Core:
  npm run db:help
  npm run db:backup
  npm run db:restore -- -y
  npm run db:migrate
  npm run db:vacuum -- -y
  npm run db:inspect
  npm run db:chat:inspect
  npm run db:user:inspect
  npm run db:file:inspect

Reset/Delete:
  npm run db:reset -- -y
  npm run db:delete -- -y
  npm run db:chat:delete -- --all -y
  npm run db:user:delete -- --all -y
  npm run db:file:delete -- -y

Users:
  npm run db:user:create -- --nickname "Songbird Sage" --username songbird.sage --password "12345678"
  npm run db:user:create -- "Songbird Sage" songbird.sage "12345678"
  npm run db:user:generate -- --count=50 --password="12345678"
  npm run db:user:edit -- songbird.sage --nickname "Songbird Sage" --color "#ff6b6b"
  npm run db:user:ban -- songbird.sage -y

Chats:
  npm run db:chat:create -- --type group --name "Core Team" --owner songbird.sage --username core.team
  npm run db:chat:add -- core.team --all
  npm run db:chat:edit -- core.team --name "Core Team HQ" --owner songbird.sage2

Messages:
  npm run db:message:generate -- 1 songbird.sage songbird.sage2 300 7

Notes:
  - Use "--" before flags when running through npm.
  - Destructive/safety-sensitive commands support -y and --yes.
  - db:user:ban is a toggle: run it again to unban the user.
  - db:backup creates an encrypted zip containing .env and data/.
  - db:restore also accepts legacy backups with songbird.db and uploads/ at the zip root.
`;

console.log(helpText.trim());
