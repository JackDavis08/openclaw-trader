/**
 * telegram-bot.ts — Telegram Command Receiver (P7.3)
 *
 * Three operating modes:
 *
 * 1. CLI tool (single execution):
 *    npm run cmd -- "/profit"
 *    Processes command directly and prints result, convenient for manual testing.
 *
 * 2. File polling mode (integrated with live-monitor):
 *    Write commands to logs/pending-commands.json,
 *    this script reads and clears them, writes responses to logs/command-responses.json.
 *
 * 3. Telegram long-polling mode (standalone daemon):
 *    Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars, runs as persistent process.
 *    npm run telegram-bot -- --poll
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";
import { parseCommand, handleCommand } from "../telegram/command-handler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, "../../logs");
const PENDING_COMMANDS_FILE = path.join(LOGS_DIR, "pending-commands.json");
const RESPONSES_FILE = path.join(LOGS_DIR, "command-responses.json");

// ─────────────────────────────────────────────────────
// Interface Definitions
// ─────────────────────────────────────────────────────

interface PendingCommand {
  id: string;
  text: string;
  timestamp: number;
}

interface CommandResponse {
  id: string;
  text: string;
  response: string;
  timestamp: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
}

// ─────────────────────────────────────────────────────
// Core Processing Logic
// ─────────────────────────────────────────────────────

async function processCommandText(text: string): Promise<string> {
  const cmd = parseCommand(text);
  if (!cmd) {
    return `❓ Invalid command: \`${text}\`\nSend /help to see the command list.`;
  }
  return handleCommand(cmd);
}

/** Process command queue from pending-commands.json */
async function processPendingCommands(): Promise<number> {
  let commands: PendingCommand[];
  try {
    const raw = fs.readFileSync(PENDING_COMMANDS_FILE, "utf-8");
    commands = JSON.parse(raw) as PendingCommand[];
  } catch {
    return 0; // File doesn't exist or is empty, normal case
  }

  if (!Array.isArray(commands) || commands.length === 0) return 0;

  // Clear command queue immediately (prevent duplicate processing)
  fs.writeFileSync(PENDING_COMMANDS_FILE, "[]");

  const responses: CommandResponse[] = [];
  for (const cmd of commands) {
    const response = await processCommandText(cmd.text);
    responses.push({
      id: cmd.id,
      text: cmd.text,
      response,
      timestamp: Date.now(),
    });
    console.log(`[CMD] ${cmd.text}\n${response}\n`);
  }

  // Append response records
  let existing: CommandResponse[];
  try {
    existing = JSON.parse(
      fs.readFileSync(RESPONSES_FILE, "utf-8")
    ) as CommandResponse[];
  } catch {
    existing = [];
  }
  fs.writeFileSync(
    RESPONSES_FILE,
    JSON.stringify([...existing, ...responses].slice(-100), null, 2)
  );

  return responses.length;
}

/** Add a command to the pending queue (for external use) */
export function enqueueCommand(text: string): void {
  let commands: PendingCommand[];
  try {
    commands = JSON.parse(
      fs.readFileSync(PENDING_COMMANDS_FILE, "utf-8")
    ) as PendingCommand[];
  } catch {
    commands = [];
  }
  commands.push({
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text,
    timestamp: Date.now(),
  });
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.writeFileSync(PENDING_COMMANDS_FILE, JSON.stringify(commands, null, 2));
}

// ─────────────────────────────────────────────────────
// Telegram Bot API helpers (no external dependencies)
// ─────────────────────────────────────────────────────

function telegramApi(token: string, method: string, body?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data).toString() } : {}),
        },
        timeout: 35000, // slightly longer than long-poll timeout
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
        res.on("end", () => {
          try {
            const json = JSON.parse(raw) as { ok: boolean; result?: unknown; description?: string };
            if (json.ok) resolve(json.result);
            else reject(new Error(json.description ?? "Telegram API error"));
          } catch { reject(new Error(`Invalid JSON: ${raw.slice(0, 200)}`)); }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Telegram API timeout")); });
    if (data) req.write(data);
    req.end();
  });
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  // Telegram message limit is 4096 chars; truncate if needed
  const truncated = text.length > 4000 ? text.slice(0, 4000) + "\n…(truncated)" : text;
  await telegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: truncated,
    parse_mode: "Markdown",
  }).catch(() => {
    // Retry without Markdown if parsing fails
    return telegramApi(token, "sendMessage", {
      chat_id: chatId,
      text: truncated,
    });
  });
}

async function runLongPolling(token: string, chatId: number): Promise<never> {
  console.log("[telegram-bot] 🤖 Starting Telegram long-polling mode…");
  console.log(`[telegram-bot] Chat ID: ${chatId}`);

  // Verify token
  const me = await telegramApi(token, "getMe") as { username?: string };
  console.log(`[telegram-bot] Bot: @${me.username ?? "unknown"}`);

  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const updates = await telegramApi(token, "getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      }) as TelegramUpdate[];

      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message;
        if (!msg?.text) continue;

        // Only respond to the configured chat
        if (msg.chat.id !== chatId) {
          console.log(`[telegram-bot] Ignoring message from chat ${msg.chat.id}`);
          continue;
        }

        console.log(`[telegram-bot] Received: ${msg.text}`);
        const response = await processCommandText(msg.text);
        await sendMessage(token, chatId, response);
        console.log(`[telegram-bot] Replied to: ${msg.text}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Don't crash on transient network errors
      if (errMsg.includes("timeout") || errMsg.includes("ECONNRESET") || errMsg.includes("ENOTFOUND")) {
        console.warn(`[telegram-bot] Network issue: ${errMsg}, retrying in 5s…`);
        await new Promise((r) => setTimeout(r, 5000));
      } else {
        console.error(`[telegram-bot] Error: ${errMsg}, retrying in 10s…`);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }
}

// ─────────────────────────────────────────────────────
// Entry: determine operating mode
// ─────────────────────────────────────────────────────

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
  process.exit(1);
});

const args = process.argv.slice(2);

if (args.includes("--poll")) {
  // Telegram long-polling mode (standalone daemon)
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];
  if (!token || !chatId) {
    console.error("[telegram-bot] ❌ TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars required for --poll mode");
    process.exit(1);
  }
  runLongPolling(token, parseInt(chatId, 10)).catch((err: unknown) => {
    console.error("[telegram-bot] Fatal:", err);
    process.exit(1);
  });
} else if (args.length > 0 && !args[0]?.startsWith("--")) {
  // CLI tool mode: npm run cmd -- "/profit"
  const text = args.join(" ");
  console.log(`\n🤖 Processing command: ${text}\n${"─".repeat(40)}`);
  const cmd = parseCommand(text);
  if (!cmd) {
    console.log(`❓ Invalid command: ${text}\nUse /help to see the command list.`);
    process.exit(1);
  }
  handleCommand(cmd)
    .then((response) => {
      console.log(response);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("Command processing failed:", err);
      process.exit(1);
    });
} else {
  // File polling mode: process pending-commands.json once
  processPendingCommands()
    .then((count) => {
      if (count === 0) {
        console.log("[telegram-bot] No pending commands");
      } else {
        console.log(`[telegram-bot] Processed ${count} command(s)`);
      }
    })
    .catch((err: unknown) => {
      console.error("[telegram-bot] Error:", err);
      process.exit(1);
    });
}
