# Database Commands

Songbird ships a set of `npm` scripts for managing the database, users, chats, files, and backups from the command line. Run them from the `server/` directory:

```bash
cd /opt/songbird/server
```

:::tip

You can also run every database command interactively via the [Deployment Script](./Deployment-Script.md) (`songbird-deploy`).

:::

## Conventions

A few rules apply across all commands:

| Convention | Detail |
|---|---|
| `--` separator | When running through npm, place `--` before any flags or arguments so npm forwards them to the script (e.g. `npm run db:backup -- --password "secret"`). |
| Selectors | Commands that target a user, chat, or file accept either a numeric **id** or a **name** (username / group username / stored file name). |
| Force flags | Destructive commands prompt for confirmation. Pass `-y` or `--yes` to skip the prompt in non-interactive contexts. |
| `--all` | Bulk delete commands refuse to run without an explicit `--all` when no selector is given. |
| Built-in help | Run `npm run db:help` for a condensed cheat sheet of every command. |

## Quick reference

| Command | Purpose |
|---|---|
| `npm run db:help` | Print the built-in command guide. |
| `npm run db:backup` | Create an encrypted backup zip of `.env` and `data/`. |
| `npm run db:restore` | Restore the database and uploads from a backup zip. |
| `npm run db:vacuum` | Compact the SQLite database file. |
| `npm run db:migrate` | Apply pending database migrations. |
| `npm run db:reset` | Wipe database content and uploaded message files. |
| `npm run db:delete` | Delete the database file. |
| `npm run db:inspect` | Print a full summary (users, chats, messages, files, disk). |
| `npm run db:chat:inspect` | Inspect chats only. |
| `npm run db:user:inspect` | Inspect users only. |
| `npm run db:file:inspect` | Inspect files only. |
| `npm run db:user:create` | Create a single user. |
| `npm run db:user:generate` | Generate random test users. |
| `npm run db:user:edit` | Edit a user profile. |
| `npm run db:user:ban` | Toggle a user's ban state. |
| `npm run db:user:delete` | Delete one, many, or all users. |
| `npm run db:chat:create` | Create a group or channel (optionally a Remote Channel). |
| `npm run db:chat:add` | Add members to a group or channel. |
| `npm run db:chat:edit` | Edit a chat profile, ownership, or Remote Channel config. |
| `npm run db:chat:delete` | Delete one, many, or all chats. |
| `npm run db:file:delete` | Delete uploaded message files and/or avatars. |
| `npm run db:message:generate` | Generate random messages between two users. |
| `npm run remote:configure` | Configure Telegram credentials for Remote Channel. |

---

## Backup & restore

### `db:backup`

Creates `data/backups/songbird-backup-<timestamp>.zip` containing `.env` and the `data/` directory. The archive is password-protected.

| Flag | Required | Description |
|---|---|---|
| `--password <value>` | No | Archive password. If omitted, you are prompted for it interactively. |

```bash
npm run db:backup -- --password "backup-password"
```

:::info

Requires the `zip` binary. Override it with the `ZIP_BIN` environment variable if needed.

:::

### `db:restore`

Restores `.env`, `songbird.db`, and `uploads/` from a backup zip. When run as root on a systemd install, it also fixes ownership and restarts `songbird.service`.

| Argument / Flag | Required | Description |
|---|---|---|
| `--file <path>` | No | Path to the backup zip. If omitted, the newest backup in `data/backups/` or `/root` is auto-detected, otherwise you are prompted. |
| `--password <value>` | No | Archive password. Prompted interactively if needed. |
| `-y`, `--yes` | No | Skip the confirmation prompt. |

```bash
npm run db:restore -- -y
npm run db:restore -- --file /path/to/songbird-backup.zip --password "backup-password" -y
```

The backup archive layout:

```text
songbird-backup-YYYY-MM-DDTHH-MM-SS-sssZ.zip
|- .env
`- data/
   |- songbird.db
   `- uploads/
```

:::info

Legacy backups with `songbird.db` and `uploads/` at the zip root are also accepted.

:::

---

## Maintenance

### `db:vacuum`

Compacts the database file to reclaim space.

| Flag | Required | Description |
|---|---|---|
| `-y`, `--yes` | No | Skip the confirmation prompt. |

```bash
npm run db:vacuum -- -y
```

### `db:migrate`

Applies any pending migrations. Migrations also run automatically on server start.

```bash
npm run db:migrate
```

### `db:reset`

Wipes database content and uploaded message files.

| Flag | Required | Description |
|---|---|---|
| `-y`, `--yes` | No | Skip the confirmation prompt. |
| `--recreate` | No | Recreate a fresh database after wiping (implied with `-y`). |
| `--no-recreate` | No | Wipe without recreating the database. |

```bash
npm run db:reset -- -y --recreate
npm run db:reset -- -y --no-recreate
```

### `db:delete`

Deletes the database file outright.

| Flag | Required | Description |
|---|---|---|
| `-y`, `--yes` | No | Skip the confirmation prompt. |

```bash
npm run db:delete -- -y
```

---

## Inspection

### `db:inspect` and friends

Prints counts, disk usage, and per-entity rows. The `db:chat:inspect`, `db:user:inspect`, and `db:file:inspect` variants scope the output to one entity.

| Argument / Flag | Required | Default | Description |
|---|---|---|---|
| `--limit <n>` | No | `25` | Max rows listed per entity (`1`-`1000`). Also accepted as a positional number. |

```bash
npm run db:inspect
npm run db:inspect -- --limit 50
npm run db:chat:inspect
npm run db:user:inspect
npm run db:file:inspect
```

---

## Users

### `db:user:create`

Creates a single user. Accepts named flags or three positional arguments (`nickname`, `username`, `password`).

| Flag | Positional | Required | Description |
|---|---|---|---|
| `--nickname <value>` | 1st | Yes | Display name. Max length follows `NICKNAME_MAX_CHARS`. |
| `--username <value>` | 2nd | Yes | Lowercase letters, numbers, `.`, `_`. Min 3 chars, max follows `USERNAME_MAX_CHARS`. |
| `--password <value>` | 3rd | Yes | Account password (bcrypt-hashed on save). |

```bash
npm run db:user:create -- --nickname "Songbird Sage" --username songbird.sage --password "12345678"

# positional form:
npm run db:user:create -- "Songbird Sage" songbird.sage "12345678"
```

### `db:user:generate`

Creates random test users.

| Flag | Positional | Required | Default | Description |
|---|---|---|---|---|
| `--count <n>` | 1st | No | `10` | Number of users to create (`1`-`5000`). |
| `--password <value>` | 2nd | No | `Passw0rd!` | Shared password for all generated users. |
| `--nickname-prefix <value>` | — | No | `User` | Prefix for generated nicknames. |
| `--username-prefix <value>` | — | No | `user` | Prefix for generated usernames. |

```bash
npm run db:user:generate -- --count 50 --password "12345678"
npm run db:user:generate -- --count 50 --password "12345678" --nickname-prefix Member --username-prefix member
```

### `db:user:edit`

Edits a user profile. The first positional argument is the user selector (id or username).

| Argument / Flag | Required | Description |
|---|---|---|
| `<user-id-or-username>` | Yes | The user to edit. |
| `--username <value>` | No | New username (same rules as create). |
| `--nickname <value>` | No | New display name. |
| `--avatar-url <value>` | No | Avatar URL, e.g. `/api/uploads/avatars/file.png`. |
| `--status <online\|invisible>` | No | Presence status. |
| `--color <#hex>` | No | Profile color, e.g. `#10b981`. |

```bash
npm run db:user:edit -- songbird.sage --nickname "Songbird Sage" --color "#ff6b6b"
npm run db:user:edit -- 1 --username songbird.admin --status invisible
```

### `db:user:ban`

Toggles a user's ban state. Running it again unbans. Banning also expires all of the user's sessions.

| Argument / Flag | Required | Description |
|---|---|---|
| `<user-id-or-username>` | Yes | The user to ban or unban. |
| `-y`, `--yes` | No | Skip the confirmation prompt. |

```bash
npm run db:user:ban -- songbird.sage
# run again to unban:
npm run db:user:ban -- songbird.sage
```

### `db:user:delete`

Deletes one, many, or all users along with their sessions and messages. Owned chats are either deleted (if no members remain) or transferred to a random remaining member.

| Argument / Flag | Required | Description |
|---|---|---|
| `<user-id-or-username> [more...]` | Conditional | One or more users to delete. Required unless `--all` is given. |
| `--all` | Conditional | Delete every user. Required when no selector is provided. |
| `-y`, `--yes` | No | Skip the confirmation prompt. |

```bash
npm run db:user:delete -- songbird.sage -y
npm run db:user:delete -- --all -y
```

---

## Chats

### `db:chat:create`

Creates a group or channel. Channels can optionally be configured as a Remote Channel at creation time.

| Flag | Required | Description |
|---|---|---|
| `--type <group\|channel>` | Yes | Chat type. |
| `--name <value>` | Yes | Display name. |
| `--owner <user>` | Yes | Owner user (id or username). |
| `--username <value>` | Yes | Public handle for the chat. |
| `--visibility <public\|private>` | No | Visibility (defaults to public). |
| `--users <a,b,c>` | No | Comma-separated initial members. |
| `--remote-channel <source>` | No | Telegram source (`@name`, `t.me` link, or numeric id). Channels only; requires `REMOTE_CHANNEL=true`. |
| `--sync-metadata` | No | Copy the source's title/avatar into the channel. |
| `--stream-media` | No | Download source media into Songbird uploads. |

```bash
npm run db:chat:create -- --type group --name "Core Team" --owner songbird.sage --username core.team --visibility private --users songbird.sage2,songbird.sage3

npm run db:chat:create -- --type channel --name "Announcements" --owner songbird.sage --username announcements

# Channel with a Remote Channel source:
npm run db:chat:create -- --type channel --name "My Channel" --owner alice --username my_channel --remote-channel @telegram_source --sync-metadata --stream-media
```

### `db:chat:add`

Adds members to a group or channel. The first positional argument is the chat selector. Users who previously left are skipped.

| Argument / Flag | Required | Description |
|---|---|---|
| `<chat-id-or-username>` | Yes | The target chat. |
| `<user> [more...]` | Conditional | One or more users to add. Required unless `--all` is given. |
| `--all` | Conditional | Add every user in the database. |

```bash
npm run db:chat:add -- core.team songbird.sage2 songbird.sage3
npm run db:chat:add -- 1 --all
```

### `db:chat:edit`

Edits a chat profile, transfers ownership, or manages its Remote Channel. The first positional argument is the chat selector.

**Profile flags:**

| Flag | Description |
|---|---|
| `--name <value>` | New display name. |
| `--username <value>` | New public handle. |
| `--visibility <public\|private>` | New visibility. |
| `--color <#hex>` | New chat color. |
| `--owner <user>` | Transfer ownership to another user. |
| `--allow-member-invites` / `--disallow-member-invites` | Toggle member invites (private chats only; public chats always allow them). |

**Remote Channel config flags (channels only):**

| Flag | Description |
|---|---|
| `--remote-channel <source>` | Set/replace the Telegram source. |
| `--sync-metadata` / `--no-sync-metadata` | Enable/disable metadata sync. |
| `--stream-media` / `--no-stream-media` | Enable/disable media streaming. |

**Remote Channel control flags:**

| Flag | Description |
|---|---|
| `--enable-remote` / `--disable-remote` | Enable or disable the configured source. |
| `--pause-queue` / `--resume-queue` | Pause or resume mirror queue processing. |
| `--skip-queue` | Skip the current queue item. |
| `--skip-all-queue` | Skip all pending/retry queue items. |

```bash
npm run db:chat:edit -- core.team --name "Core Team HQ" --visibility public --color "#14b8a6"
npm run db:chat:edit -- 1 --owner songbird.sage2

# Remote Channel:
npm run db:chat:edit -- my_channel --remote-channel @new_telegram_source
npm run db:chat:edit -- my_channel --no-stream-media
npm run db:chat:edit -- my_channel --enable-remote
npm run db:chat:edit -- my_channel --pause-queue
npm run db:chat:edit -- my_channel --skip-all-queue
```

### `db:chat:delete`

Deletes one, many, or all chats and their related data (messages, members, files).

| Argument / Flag | Required | Description |
|---|---|---|
| `<chat-id-or-username> [more...]` | Conditional | One or more chats to delete. Required unless `--all` is given. |
| `--all` | Conditional | Delete every chat. Required when no selector is provided. |
| `-y`, `--yes` | No | Skip the confirmation prompt. |

```bash
npm run db:chat:delete -- 12 -y
npm run db:chat:delete -- core.team -y
npm run db:chat:delete -- --all -y
```

---

## Files

### `db:file:delete`

Deletes uploaded message files and/or avatar files, both from the database and from disk.

| Argument / Flag | Required | Description |
|---|---|---|
| `<file-id-or-name> [more...]` | Conditional | File ids or stored file names to delete. Required unless `--all` is given. |
| `--all` | Conditional | Delete all uploaded files (message files + avatars). |
| `-y`, `--yes` | No | Skip the confirmation prompt. |

```bash
npm run db:file:delete -- 42 -y
npm run db:file:delete -- stored-file-name.ext -y
npm run db:file:delete -- --all -y
```

---

## Messages

### `db:message:generate`

Generates random messages in one chat between two users. Accepts positional arguments or named flags.

| Argument / Flag | Positional | Required | Default | Description |
|---|---|---|---|---|
| `--chatId <id>` | 1st | Yes | — | Target chat id. |
| `--userA <user>` | 2nd | Yes | — | First participant (id or username). |
| `--userB <user>` | 3rd | Yes | — | Second participant (id or username). |
| `--count <n>` | 4th | No | `1` | Number of messages (`1`-`10000`). |
| `--days <n>` | 5th | No | `7` | Spread messages across the last N days (`1`-`365`). |

```bash
npm run db:message:generate -- 1 songbird.sage songbird.sage2 300 7
npm run db:message:generate -- --chatId 1 --userA songbird.sage --userB songbird.sage2 --count 300 --days 7
```

---

## Running commands via Docker

Run any npm script inside the running container by prefixing with `--prefix /app/server`:

```bash
docker compose exec songbird npm --prefix /app/server run db:backup
docker compose exec songbird npm --prefix /app/server run db:migrate
docker compose exec songbird npm --prefix /app/server run db:inspect
```
