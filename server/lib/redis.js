import { EventEmitter } from "node:events";
import Redis from "ioredis";

class InProcessRedisClient extends EventEmitter {
  constructor(sharedState) {
    super();
    this.sharedState = sharedState;
    this.subscriptions = new Set();
  }

  async get(key) {
    const item = this.sharedState.store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.sharedState.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key, value, ...args) {
    let expiresAt = null;
    for (let i = 0; i < args.length; i++) {
      const arg = String(args[i]).toUpperCase();
      if (arg === "EX" && i + 1 < args.length) {
        expiresAt = Date.now() + Number(args[i + 1]) * 1000;
        i++;
      } else if (arg === "PX" && i + 1 < args.length) {
        expiresAt = Date.now() + Number(args[i + 1]);
        i++;
      }
    }
    this.sharedState.store.set(key, { value: String(value), expiresAt });
    return "OK";
  }

  async del(...keys) {
    let count = 0;
    for (const key of keys) {
      if (this.sharedState.store.delete(key)) count++;
    }
    return count;
  }

  async subscribe(...channels) {
    for (const ch of channels) {
      this.subscriptions.add(ch);
      if (!this.sharedState.subscribers.has(ch)) {
        this.sharedState.subscribers.set(ch, new Set());
      }
      this.sharedState.subscribers.get(ch).add(this);
    }
    return channels.length;
  }

  async unsubscribe(...channels) {
    for (const ch of channels) {
      this.subscriptions.delete(ch);
      const subs = this.sharedState.subscribers.get(ch);
      if (subs) {
        subs.delete(this);
        if (subs.size === 0) this.sharedState.subscribers.delete(ch);
      }
    }
    return channels.length;
  }

  async publish(channel, message) {
    const subs = this.sharedState.subscribers.get(channel);
    if (!subs) return 0;
    const msgStr = String(message);
    subs.forEach((client) => {
      client.emit("message", channel, msgStr);
    });
    return subs.size;
  }

  duplicate() {
    return new InProcessRedisClient(this.sharedState);
  }

  async quit() {
    for (const ch of this.subscriptions) {
      const subs = this.sharedState.subscribers.get(ch);
      if (subs) subs.delete(this);
    }
    this.subscriptions.clear();
    this.removeAllListeners();
    return "OK";
  }

  async disconnect() {
    return this.quit();
  }
}

export function createRedisClient(config = {}) {
  const host = config.host || process.env.REDIS_HOST;
  const port = config.port || process.env.REDIS_PORT;
  const url = config.url || process.env.REDIS_URL;
  const isRedisConfigured = Boolean(host || url);

  if (!isRedisConfigured && !config.forceReal) {
    const sharedState = config.sharedState || {
      store: new Map(),
      subscribers: new Map(),
    };

    const client = new InProcessRedisClient(sharedState);
    client.isFallback = true;
    return client;
  }

  try {
    const options = url ? url : { host: host || "127.0.0.1", port: Number(port) || 6379 };
    const client = new Redis(options);
    client.isFallback = false;
    return client;
  } catch (error) {
    console.warn("[redis] Failed to instantiate ioredis client, falling back to in-process:", error?.message || error);
    const sharedState = config.sharedState || {
      store: new Map(),
      subscribers: new Map(),
    };
    const client = new InProcessRedisClient(sharedState);
    client.isFallback = true;
    return client;
  }
}

export function createRedisSessionStore({ redisClient, dbGetSession }) {
  const SESSION_PREFIX = "session:";
  const DEFAULT_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days

  return {
    async createSession(userId, token) {
      const key = `${SESSION_PREFIX}${token}`;
      const payload = JSON.stringify({ userId, createdAt: Date.now() });
      await redisClient.set(key, payload, "EX", DEFAULT_TTL_SECONDS);
    },

    async getSession(token) {
      if (!token) return null;
      const key = `${SESSION_PREFIX}${token}`;
      const cached = await redisClient.get(key);

      if (cached) {
        // Hydrate from DB or return cached payload
        if (typeof dbGetSession === "function") {
          const dbSession = dbGetSession(token);
          if (dbSession) return dbSession;
        }
        try {
          return JSON.parse(cached);
        } catch {
          return null;
        }
      }

      // Fallback to DB session lookup
      if (typeof dbGetSession === "function") {
        const dbSession = dbGetSession(token);
        if (dbSession) {
          await redisClient.set(
            key,
            JSON.stringify({
              userId: dbSession.id,
              username: dbSession.username,
            }),
            "EX",
            DEFAULT_TTL_SECONDS,
          );
          return dbSession;
        }
      }

      return null;
    },

    async touchSession(token) {
      if (!token) return;
      const key = `${SESSION_PREFIX}${token}`;
      const cached = await redisClient.get(key);
      if (cached) {
        await redisClient.set(key, cached, "EX", DEFAULT_TTL_SECONDS);
      }
    },

    async deleteSession(token) {
      if (!token) return;
      const key = `${SESSION_PREFIX}${token}`;
      await redisClient.del(key);
    },
  };
}

