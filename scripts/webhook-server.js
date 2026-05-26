#!/usr/bin/env node
/**
 * Songbird GitHub Webhook Server
 *
 * Listens for GitHub "release" webhook events and triggers auto-update.sh
 * when a new release is published.
 *
 * Environment variables:
 *   WEBHOOK_SECRET   - GitHub webhook secret (required)
 *   WEBHOOK_PORT     - Port to listen on (default: 9000)
 *   INSTALL_DIR      - Songbird install path (default: /opt/songbird)
 *   LOG_FILE         - Log file path (default: /opt/songbird/logs/webhook.log)
 *   UPDATE_SCRIPT    - Path to auto-update.sh (default: <INSTALL_DIR>/scripts/auto-update.sh)
 */

import http from "node:http";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const PORT = parseInt(process.env.WEBHOOK_PORT || "9000", 10);
const INSTALL_DIR = process.env.INSTALL_DIR || "/opt/songbird";
const LOG_FILE =
  process.env.LOG_FILE || path.join(INSTALL_DIR, "logs", "webhook.log");
const UPDATE_SCRIPT =
  process.env.UPDATE_SCRIPT ||
  path.join(INSTALL_DIR, "scripts", "auto-update.sh");

if (!WEBHOOK_SECRET) {
  console.error(
    "[webhook] WEBHOOK_SECRET is not set. Set it in /etc/songbird-webhook.env"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [webhook] ${msg}\n`;
  process.stdout.write(line);
  logStream.write(line);
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(payload, signature) {
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest("hex")}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Update runner (serialized — only one update at a time)
// ---------------------------------------------------------------------------

let updateRunning = false;

function runUpdate(tag) {
  if (updateRunning) {
    log(`Update already in progress — skipping trigger for ${tag}`);
    return;
  }
  updateRunning = true;
  log(`Triggering auto-update for tag: ${tag}`);

  const args = tag ? ["--tag", tag] : [];
  const child = execFile(
    UPDATE_SCRIPT,
    args,
    {
      env: { ...process.env, INSTALL_DIR },
      timeout: 10 * 60 * 1000, // 10 minutes max
    },
    (err, stdout, stderr) => {
      updateRunning = false;
      if (err) {
        log(`Update FAILED (exit ${err.code}): ${err.message}`);
      } else {
        log(`Update completed successfully for ${tag}`);
      }
      if (stdout) log(`[update stdout] ${stdout.trim()}`);
      if (stderr) log(`[update stderr] ${stderr.trim()}`);
    }
  );

  child.on("error", (err) => {
    updateRunning = false;
    log(`Failed to spawn update script: ${err.message}`);
  });
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", updateRunning }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    const signature = req.headers["x-hub-signature-256"] || "";
    const event = req.headers["x-github-event"] || "";

    // Verify signature
    if (!verifySignature(rawBody, signature)) {
      log(`Rejected request — invalid signature (event: ${event})`);
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    // Only handle "release" events with action "published"
    if (event !== "release") {
      res.writeHead(200);
      res.end("Ignored");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }

    if (payload.action !== "published") {
      log(`Release event ignored (action: ${payload.action})`);
      res.writeHead(200);
      res.end("Ignored");
      return;
    }

    const tag = payload.release?.tag_name || "";
    log(`Release published: ${tag}`);

    // Respond immediately so GitHub doesn't time out
    res.writeHead(200);
    res.end("OK");

    // Trigger update asynchronously
    runUpdate(tag);
  });

  req.on("error", (err) => {
    log(`Request error: ${err.message}`);
    res.writeHead(500);
    res.end("Internal error");
  });
});

server.listen(PORT, "127.0.0.1", () => {
  log(`Webhook server listening on 127.0.0.1:${PORT}`);
  log(`Update script: ${UPDATE_SCRIPT}`);
});

server.on("error", (err) => {
  log(`Server error: ${err.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  log("Received SIGTERM, shutting down...");
  server.close(() => process.exit(0));
});
