import {
  getCliArgs,
  getPositionalArgs,
  getFlagValue,
  getNpmOriginalArgs,
} from "./_cli.js";
import { openDatabase, runAdminActionViaServer } from "./_db-admin.js";

const SAMPLE_MESSAGES = [
  "Hello there",
  "How are you doing?",
  "Sounds good",
  "I will check and reply",
  "Can you send details?",
  "Sure, one second",
  "Thanks",
  "Got it",
  "Let us do it",
  "Looks great",
  "See you soon",
  "On my way",
  "Please review this",
  "Done",
  "Perfect",
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildTimestampSchedule(count, daysBack) {
  const days = Math.max(1, daysBack);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowSecondsOfDay =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const startDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  startDay.setDate(startDay.getDate() - (days - 1));

  const perDay = new Array(days).fill(0);
  for (let i = 0; i < count; i += 1) {
    perDay[i % days] += 1;
  }

  const stamps = [];
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const messagesInDay = perDay[dayIndex];
    if (!messagesInDay) continue;
    const dayStart = new Date(startDay);
    dayStart.setDate(startDay.getDate() + dayIndex);
    const isToday =
      dayStart.getFullYear() === today.getFullYear() &&
      dayStart.getMonth() === today.getMonth() &&
      dayStart.getDate() === today.getDate();
    const maxSecondOfDay = isToday
      ? Math.max(0, Math.min(86399, nowSecondsOfDay))
      : 86399;
    const seconds = [];
    for (let i = 0; i < messagesInDay; i += 1) {
      const secondOfDay = Math.floor(Math.random() * (maxSecondOfDay + 1));
      seconds.push(secondOfDay);
    }
    seconds.sort((a, b) => a - b);
    for (let i = 0; i < seconds.length; i += 1) {
      stamps.push(
        new Date(dayStart.getTime() + seconds[i] * 1000).toISOString(),
      );
    }
  }
  return stamps;
}

function parseUserSelector(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return { by: "id", value: Math.trunc(numeric) };
  }
  return { by: "username", value: raw };
}

function resolveUserId(dbApi, selector) {
  if (!selector) return null;
  if (selector.by === "id") {
    const row = dbApi.getRow("SELECT id FROM users WHERE id = ?", [
      selector.value,
    ]);
    return row?.id ? Number(row.id) : null;
  }
  const row = dbApi.getRow("SELECT id FROM users WHERE username = ?", [
    selector.value,
  ]);
  return row?.id ? Number(row.id) : null;
}

async function main() {
  const args = getCliArgs();
  const npmArgs = getNpmOriginalArgs();
  const positional = getPositionalArgs(args);
  const npmPositional = getPositionalArgs(npmArgs);

  const chatIdRaw =
    positional[0] ||
    npmPositional[0] ||
    getFlagValue(args, "--chat-id") ||
    getFlagValue(npmArgs, "--chat-id") ||
    getFlagValue(args, "--chatId") ||
    getFlagValue(npmArgs, "--chatId");
  const userOneRaw =
    positional[1] ||
    npmPositional[1] ||
    getFlagValue(args, "--user-a") ||
    getFlagValue(npmArgs, "--user-a") ||
    getFlagValue(args, "--userA") ||
    getFlagValue(npmArgs, "--userA");
  const userTwoRaw =
    positional[2] ||
    npmPositional[2] ||
    getFlagValue(args, "--user-b") ||
    getFlagValue(npmArgs, "--user-b") ||
    getFlagValue(args, "--userB") ||
    getFlagValue(npmArgs, "--userB");
  const countRaw =
    positional[3] ||
    npmPositional[3] ||
    getFlagValue(args, "--count") ||
    getFlagValue(npmArgs, "--count") ||
    "1";
  const daysBackRaw =
    positional[4] ||
    npmPositional[4] ||
    getFlagValue(args, "--days") ||
    getFlagValue(npmArgs, "--days") ||
    "7";

  const chatId = Number(chatIdRaw);
  const count = Math.max(1, Math.min(10000, Number(countRaw) || 0));
  const daysBack = Math.max(1, Math.min(365, Number(daysBackRaw) || 7));

  if (
    !Number.isFinite(chatId) ||
    chatId <= 0 ||
    !userOneRaw ||
    !userTwoRaw ||
    !count
  ) {
    console.error(
      "Usage (recommended): npm run db:message:generate -- 1 alice bob 300 7",
    );
    console.error(
      "Usage (named args): npm run db:message:generate -- --chatId 1 --userA alice --userB bob --count 300 --days 7",
    );
    console.error("Users can be username or user id.");
    process.exitCode = 1;
    return;
  }

  let remoteErrorMessage = "";
  try {
    const remoteResult = await runAdminActionViaServer(
      "generate_chat_messages",
      {
        chatId,
        userA: userOneRaw,
        userB: userTwoRaw,
        count,
        days: daysBack,
      },
    );
    if (remoteResult) {
      console.log(
        `Server mode generated messages: ${remoteResult.created ?? 0}`,
      );
      console.log(`Chat: ${remoteResult.chatId ?? chatId}`);
      return;
    }
  } catch (error) {
    remoteErrorMessage = String(error?.message || "");
    console.warn(`Server mode failed: ${remoteErrorMessage}`);
    console.warn("Falling back to direct DB mode for this command.");
  }

  const dbApi = await openDatabase();
  try {
    const chatRow = dbApi.getRow("SELECT id FROM chats WHERE id = ?", [chatId]);
    if (!chatRow?.id) {
      console.error(`Chat not found: ${chatId}`);
      if (remoteErrorMessage) {
        console.error(`Server mode error was: ${remoteErrorMessage}`);
      }
      process.exitCode = 1;
      return;
    }

    const userAId = resolveUserId(dbApi, parseUserSelector(userOneRaw));
    const userBId = resolveUserId(dbApi, parseUserSelector(userTwoRaw));
    if (!userAId || !userBId) {
      console.error("One or both users not found.");
      if (remoteErrorMessage) {
        console.error(`Server mode error was: ${remoteErrorMessage}`);
      }
      process.exitCode = 1;
      return;
    }
    if (userAId === userBId) {
      console.error("user-a and user-b must be different users.");
      process.exitCode = 1;
      return;
    }

    dbApi.run("BEGIN");
    try {
      dbApi.run(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
        [chatId, userAId, "member"],
      );
      dbApi.run(
        "INSERT OR IGNORE INTO chat_members (chat_id, user_id, role) VALUES (?, ?, ?)",
        [chatId, userBId, "member"],
      );

      const timestamps = buildTimestampSchedule(count, daysBack);

      for (let index = 0; index < count; index += 1) {
        const senderId = index % 2 === 0 ? userAId : userBId;
        const body = `${pickRandom(SAMPLE_MESSAGES)} #${index + 1}`;
        dbApi.run(
          "INSERT INTO chat_messages (chat_id, user_id, body, created_at, read_at, read_by_user_id) VALUES (?, ?, ?, ?, NULL, NULL)",
          [chatId, senderId, body, timestamps[index]],
        );
      }

      dbApi.run("COMMIT");
    } catch (error) {
      dbApi.run("ROLLBACK");
      throw error;
    }

    dbApi.save();
    console.log(`Generated messages: ${count}`);
    console.log(`Chat: ${chatId}`);
    console.log(`Users: ${userAId}, ${userBId}`);
  } finally {
    dbApi.close();
  }
}

await main();
