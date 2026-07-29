## 0.11.3

### Security
- 🔧 Fixed a message at-rest encryption bypass caused by untrusted ciphertext-marker handling.


## 0.11.2

### New Features

- 🏅 Verified and role badge system for users and chats

### Improvements

- 🐋 Production-ready Docker and cloud platform deployment with container health checks
- 🔌 Configurable server bind address and graceful shutdown handling
- ⚡ Faster admin panel with server-side pagination for users, chats, and logs
- 🔢 Adjustable page-size selector on admin pagination controls
- 📊 Smoother dashboard stats with cached system metrics
- 💨 Snappier chat experience with reduced SSE-driven refetching and debounced chat list reloads
- 🎨 Refreshed upload menu styling to match the new dropdown design

### Bug Fixes

- 💬 Keep the connection alive when navigating in and out of the admin panel
- 🔄 Sidebar now updates instantly when members are added, removed, or have their role changed
- 🎨 Include reply author color in message replies
- 🚪 Sign out all clients correctly after a database reset or restore
- 🛠️ Service control now works on Docker deployments

**⏺️ If you encountered any problem, don't forget to submit an issue on Songbird github repository.**

**⭐ Don't forget to give a star to Songbird github repository!**

🕊️ [Songbird main server](https://chat.songbird.website/invite/songbird)

📢 [Songbird Telegram channel](https://t.me/songbirdapp)

🌐 [Songbird Github repository](https://github.com/bllackbull/Songbird)

## 0.11.1

### New Features

- 🧠 Smart caching with proper silent background updates for admin panel

### Improvements

- 📊 Increased admin data limits to 1000 rows per tab
- 🚀 Raised API rate limit to 1000 req/15min and excluded SSE endpoint
- 📜 Auto-scroll system logs to bottom on load for better visibility
- 📱 Responsive log windows on mobile screens (40vh on mobile, 60vh on desktop)
- 🌐 Enhanced bidirectional text handling in log descriptions

### Bug Fixes

- 🔒 Resolved permission issues for logs and service control on dedicated-user deployments
- 👥 Fixed presence status computed server-side on initial load (eliminates ghost green dot)

## 0.11.0

### New Features

- 🛡️ Admin Panel with full user and chat management
- 👑 Owner role with elevated permissions
- ⚙️ Runtime settings configurable from the admin panel (moved from `.env` to database)
- 📋 File-based audit logs with multi-source logs page
- 🔒 `ADMIN_PANEL` env flag to disable the admin panel entirely
- 🧑‍💼 Unified create/edit user modal with avatar and inline password reset
- 💬 Danger zone — clear all messages and reset the database
- 🔁 App version check and service restart/stop from Actions tab
- 🖥️ Admin presence pings with idle auto-exit
- 💡 Prompt to create an owner user after a fresh install
- 📖 Songbird Wiki website at `docs.songbird.website`
- 🎨 Settings page design improvements to be more touch-friendly for mobile screens
- 🕑 Show "last seen" timestamp status for non-invisible users
- 🔧 Bug fixes

## 0.10.3

### New Features

- 📡 Songbird as a second Remote Channel source provider
- 💬 Message preview toggle in notification settings

### Improvements

- 📱 Tap chats button on mobile to scroll back to top
- ⌨️ Deselect chat with Escape key
- 🔢 Compact unread count format (e.g. 1K+)
- 🔕 Skip push notifications for users with an active SSE connection
- 🔒 Centralized and stricter username validation
- 💨 Performance optimizations on hot paths
- 🔧 Bug fixes

## 0.10.2

- 🎨 UI design update for the about page and queue status section
- 🖱️ Infinite scroll on chat members list
- 🦻 Accessibility improvements
- 💨 Performance optimization
- 🔧 Bug fixes

## 0.10.1

### Improvements

- 📄 Remote channel queue status report on channel profile.
- 🎛️ Remote channel queue action buttons to pause, skip or test connection.
- 📡 Force remote channel client reset on connection erros to prevent reconnection deadlock.
- 📨 Parallelize remote channel source polling.
- 🔗 Proxy configuration to reach push notification endpoints.
- 💨 Remote channel optimization and loading speed improvements.
- ⚙️ env vars to disable remote channel option or stream media option in UI.
- ➕ Remote channel configuration support in "Create Chat" and "Edit Chat" database commands.
- 🔧 Bug fixes

## 0.10.0

### New Features

- 📡 Remote Channel

### Improvements

- 🔗 Invite Link System simplification
- 🎨 Create/Edit Chat modal UI overhaul
- 🔧 Bug fixes

## 0.9.2

- ✨ Chat window build animations
- 🔔 Push Notification system improvements
- 🎨 UI/UX improvements
- 📥 Installer script UI improvements
- 🐋 TLS support using self-signed SSL certs in Docker
- 🔧 Bug fixes

## 0.9.1

- 🔧 UI bug fixes
- 💨 Client-side loading optimization

## 0.9.0

### New Features

- 📥 Offline Update via script
- 🔒 Client-Server Encryption
- ↪️ Forward Message
- 🗑️ Delete Message
- ✏️ Edit Message
- 📃 Built-in Context Menu
- ℹ️ About Page
- 💬 Text message auto-deletion option
- 📜 6-Days certificate option for IPs via script
- ♻️ Database backup restoration
- 🚫 "Ban user" database command

### Improvements

- 🔍 Zooming improvements for media
- ⌨️ Typing Indicator
- ✨ UI/UX Improvements
- 📜 Certificate Installation with SSL key files
- ➕ "Create chat" database command
- ✏️ "Edit chat" database command
- 👤 "Edit user" database command
- ⚙️ Custom port setting option for nginx during script installation domain mode.
- 💨 Increased loading speed and server-side resource usage improvements
- 🔧 Along with a lot of bug fixes!