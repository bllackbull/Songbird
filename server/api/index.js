import { registerAdminRoutes } from "./admin.js";
import { registerAuthRoutes } from "./auth.js";
import { registerChatRoutes } from "./chats.js";
import { registerHealthRoutes } from "./health.js";
import { registerMessageRoutes } from "./messages.js";
import { registerPresenceRoutes } from "./presence.js";
import { registerProfileRoutes } from "./profile.js";

function registerApiRoutes(app, deps) {
  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerPresenceRoutes(app, deps);
  registerProfileRoutes(app, deps);
  registerChatRoutes(app, deps);
  registerMessageRoutes(app, deps);
  registerAdminRoutes(app, deps);
}

export { registerApiRoutes };
