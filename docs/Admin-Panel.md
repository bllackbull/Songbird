# Admin Panel

The Admin Panel provides a web-based interface for managing users, chats, runtime settings, and system operations. It's accessible to users with the **owner** or **admin** role.

## User Roles

- **Owner**: Full access to admin panel and all features
- **Admin**: Limited access to admin panel
- **User**: Regular user with no admin access

:::warning

Only one user with owner role can exist at a time.

:::

## Accessing the Admin Panel

1. Create or edit a user and give them the **owner** or **admin** role (prompted on fresh install, or later via the the [Deployment Script](./Deployment-Script.md)):

  ```bash
  songbird-deploy
  # Navigate to "Manage Database" submenu
  # Select "Create user" or "Edit user"
  # Follow prompts and select either "owner" or "admin" role
  ```
  :::info You can also use [database commands](./Database-Commands.md) if you prefer:

   ```bash
   cd /opt/songbird/server
   # If you want to create a new user
   npm run db:user:create
   # Or if you want to promote a user
   npm run db:user:edit
   # Follow prompts and select either "owner" or "admin" role
   ```
  :::

2. Log in to your Songbird instance with the promoted account

3. Click the **Admin Panel** button in the sidebar (accessible only by owner and admins)

## Dashboard Tab

The Dashboard provides an overview of your Songbird instance:

- **Statistics**: Total users, chats, messages, and uploaded files
- **System Info**: Uptime, and environment
- **Storage**: Database and upload directory size

## Users Tab

Manage all users in your Songbird instance:

### Features

- **View All Users**: List with sorting and filtering (1000 row limit)
- **Create Users**: Create new accounts with username, nickname, password
- **Edit Users**: 
  - Update username, nickname, avatar
  - Reset password inline
  - Change user role (admin/user)
  - Ban/unban users
- **Delete Users**: Permanently remove user accounts
- **Search & Filter**: Find users by username or nickname
- **Sorting**: Sort by username, nickname, created date, or last seen

## Chats Tab

Manage DMs, groups, and channels:

### Features

- **View All Chats**: List with type, members, and creation date
- **Create Chats**: Create a new group or channel
- **Edit Chats**: Update a chat metadata and its ownership
- **Delete Chats**: Permanently remove chats and all messages
- **Search & Filter**: Find chats by name, username, or type
- **Member Management**: View and modify chat membership

## Settings Tab

Configure runtime settings through the UI (replaces most `.env` variables):

### Categories

**General**
- Debug logging
- Sign up {Public Server}

**File Upload**
- File upload feature enabled
- Max file size per upload
- Max total size per message
- Max files per message
- Video transcoding enabled

**Message Retention**
- File retention period (days)
- Text message retention period (days)

**Limits**
- Max message length (characters)
- Max username length
- Max nickname length

**Client Behavior**
- Message fetch limits
- Message page size
- Cache TTL

**Push Notifications**
- Proxy URL for push delivery

**Remote Channel**
- Remote Channel feature enabled
- Allow UI toggle for channel owners
- Allow media streaming option
- Polling and queue configuration
- Proxy URLs for Telegram and Songbird

:::info Environment Override

[Environment variables](./Environment-Variables.md) in `.env` take precedence over database settings. Locked fields indicate an env override is active.

:::

## Logs Tab

View audit logs and system logs:

### Audit Logs

File-based logs of admin actions:
- User CRUD operations
- Chat CRUD operations
- Settings changes
- System actions

Each entry includes:
- Timestamp
- Actor (who performed the action)
- Action type and description
- Affected entities

### System Logs

Aggregated logs from multiple sources:
- Systemd journal (if running via systemd)
- Direct log files

## Actions Tab

Perform system administration tasks:

### Database Operations

**Backup**
- Download a timestamped engine-native database backup
- SQLite downloads a `.db` file; PostgreSQL downloads a native `.dump` archive created with `pg_dump`

**Restore**
- SQLite backups can be uploaded and restored while the service is running
- PostgreSQL restore is deliberately offline-only: stop Songbird, then use `npm run db:restore -- -y --file <backup.dump>`

**Vacuum**
- SQLite compacts the database file with `VACUUM`
- PostgreSQL runs native `VACUUM ANALYZE`
- Reclaims unused space and is recommended periodically for large databases

### System Control

**Version Check**
- Check current installed version
- Compare with latest GitHub release
- See if update is available

**Restart Service**
- Restart the Songbird server
- Applies pending changes
- Reconnects all clients

**Stop Service**
- Gracefully stop the Songbird server
- Requires manual start via systemd/Docker

:::warning Permission Requirements

Service control (restart/stop) requires the right setup depending on deployment:

- **Docker**: The `songbird` container must have the Docker socket mounted (`/var/run/docker.sock`). This is included in the default `docker-compose.yaml`. The `SONGBIRD_CONTAINER_NAME` environment variable tells the app which container to target (defaults to `songbird`). See [Install via Docker](./Installation-Docker.md#admin-panel-service-control).
- **Systemd**: The service user must have `sudo` privileges for `systemctl`. See [Troubleshooting](./Troubleshooting.md#admin-panel-issues).

:::

### Danger Zone

**Clear All Messages**
- Delete all messages from all chats
- Preserves chat structure and membership
- Preserves user accounts
- Irreversible operation

**Reset Database**
- Clears users, chats, messages, sessions, and stored message files while preserving the schema and runtime settings
- Irreversible operation

:::danger Irreversible Actions

Danger Zone actions cannot be undone. Always create a backup before proceeding.

:::

## Disabling the Admin Panel

To completely disable the admin panel:

```bash
# In .env
ADMIN_PANEL=false
```

When disabled:
- Admin button hidden from UI
- Admin API endpoints return 403
- Existing owner and admin accounts remain but cannot access panel

## Security Notes

- Admin API uses a separate authentication token (`ADMIN_API_TOKEN`)
- Auto-generated on first run and saved to `.env`
- Admin endpoints are localhost-only by design
- All admin actions are logged for audit trail
- Rate limiting applies (1000 req/15min as of v0.11.1)

## CLI Alternative

Most admin operations can still be performed via CLI:

```bash
cd /opt/songbird/server

# User management
npm run db:user:create
npm run db:user:edit
npm run db:user:delete
npm run db:user:ban

# Chat management
npm run db:chat:create
npm run db:chat:edit
npm run db:chat:delete

# Database operations
npm run db:backup
npm run db:restore
npm run db:vacuum
npm run db:inspect
```

See [Database Commands](./Database-Commands.md) for full CLI reference.

