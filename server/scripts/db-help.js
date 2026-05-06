const helpText = `
Songbird DB Commands

Core:
  npm run db:help
  npm run db:backup -- --password "backup-password"
  npm run db:restore -- -y --file /path/to/songbird-backup.zip [--password "backup-password"]
  npm run db:migrate
  npm run db:vacuum -- -y
  npm run db:inspect -- --limit 25
  npm run db:chat:inspect -- --limit 25
  npm run db:user:inspect -- --limit 25
  npm run db:file:inspect -- --limit 25

Reset/Delete:
  npm run db:reset -- -y --recreate
  npm run db:reset -- -y --no-recreate
  npm run db:delete -- -y
  npm run db:chat:delete -- -y 12
  npm run db:chat:delete -- -y core.team
  npm run db:chat:delete -- --all -y
  npm run db:user:delete -- -y songbird.sage
  npm run db:user:delete -- --all -y
  npm run db:file:delete -- -y 42
  npm run db:file:delete -- -y stored-file-name.ext
  npm run db:file:delete -- --all -y

Users:
  npm run db:user:create -- --nickname "Songbird Sage" --username songbird.sage --password "12345678"
  npm run db:user:create -- "Songbird Sage" songbird.sage "12345678"
  npm run db:user:generate -- --count 50 --password "12345678" --nickname-prefix User --username-prefix user
  npm run db:user:edit -- songbird.sage --nickname "Songbird Sage" --color "#ff6b6b"
  npm run db:user:ban -- songbird.sage -y

Chats:
  npm run db:chat:create -- --type group --name "Core Team" --owner songbird.sage --username core.team --visibility public --users bob,charlie
  npm run db:chat:add -- core.team --all
  npm run db:chat:add -- core.team bob charlie
  npm run db:chat:edit -- core.team --name "Core Team HQ" --owner songbird.sage2
  npm run db:chat:edit -- core.team --visibility private --disallow-member-invites

Messages:
  npm run db:message:generate -- 1 songbird.sage songbird.sage2 300 7
  npm run db:message:generate -- --chatId 1 --userA songbird.sage --userB songbird.sage2 --count 300 --days 7

Notes:
  - Use "--" before flags when running through npm.
  - Required values are shown in the examples above; optional values are in brackets.
  - Delete-all actions use explicit --all.
  - Destructive/safety-sensitive commands support -y and --yes.
  - db:user:ban is a toggle: run it again to unban the user.
  - db:backup creates an encrypted zip containing .env and data/.
  - db:restore also accepts legacy backups with songbird.db and uploads/ at the zip root.
`;

console.log(helpText.trim());
