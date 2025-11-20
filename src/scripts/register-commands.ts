import { REST, Routes, SlashCommandBuilder } from "discord.js";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { CONFIG } from "../config/resolved.js";

type CommandModule = {
  data?: SlashCommandBuilder;
};

const DEV_GUILD_ID = CONFIG.system.devGuildId;
const GUILD_ID = CONFIG.system.guildId;

const CLEAR_GLOBAL = process.argv.includes("--clear-global");
const LIST = process.argv.includes("--list");
const PROD =
  process.argv.includes("--prod") || process.argv.includes("--production");

// Determine if we're in dev mode (when NOT using --prod flag)
const IS_DEV = !PROD;

// Use appropriate token and APP_ID based on mode
const TOKEN = IS_DEV ? CONFIG.secrets.devToken : CONFIG.secrets.token;
const APP_ID = IS_DEV ? CONFIG.system.devAppId : CONFIG.system.appId;

// Safety guards
if (PROD && !GUILD_ID) {
  throw new Error(
    "Refusing to run with --prod/--production without GUILD_ID set in env."
  );
}

if (IS_DEV && !CONFIG.secrets.devToken) {
  throw new Error("DEV_DISCORD_TOKEN not set in env. Required for dev mode.");
}

if (IS_DEV && !CONFIG.system.devAppId) {
  throw new Error("DEV_APP_ID not set in env. Required for dev mode.");
}

async function findCommandFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await findCommandFiles(p)));
    else if (e.isFile() && /\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name))
      out.push(p);
  }
  return out;
}

async function loadCommandJSONs(): Promise<object[]> {
  const commandsDir = path.resolve("src/commands");
  const files = await findCommandFiles(commandsDir);
  const jsons: object[] = [];

  for (const f of files) {
    const modUrl = pathToFileURL(f).href; // works with tsx
    const mod: CommandModule = await import(modUrl);
    if (!mod.data) continue;
    const cmdJSON = mod.data.toJSON();
    if (IS_DEV){
      // Modify the name dynamically
      cmdJSON.name = `dev_${cmdJSON.name}`;
    }
    jsons.push(cmdJSON);
  }
  return jsons;
}

async function main() {
  if (!TOKEN || !APP_ID) {
    throw new Error("Missing TOKEN or APP_ID for current mode.");
  }

  console.log(`🤖 Running in ${IS_DEV ? "DEVELOPMENT" : "PRODUCTION"} mode`);
  console.log(`📱 Using APP_ID: ${APP_ID}`);

  const body = await loadCommandJSONs();
  if (body.length === 0) {
    console.warn("No commands found in src/commands");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  async function list() {
    const global = (await rest.get(Routes.applicationCommands(APP_ID!))) as {
      name: string;
    }[];
    console.log(
      "Global commands: ",
      global.map((c) => c.name)
    );
  }

  if (PROD) {
    if (!GUILD_ID) {
      throw new Error(
        "GUILD_ID not set. Refusing to deploy globally. Set GUILD_ID or pass --clear-global/--list."
      );
    }
    console.log(`Upserting ${body.length} commands to guild ${GUILD_ID}…`);
    await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), { body });
    console.log("✅ Guild commands updated (instant).");
    return;
  } else if (DEV_GUILD_ID) {
    console.log(
      `Upserting ${body.length} commands to dev guild ${DEV_GUILD_ID}…`
    );
    await rest.put(Routes.applicationGuildCommands(APP_ID, DEV_GUILD_ID), {
      body,
    });
    console.log("✅ Guild commands updated (instant).");
  } else {
    // HARD GUARD: refuse accidental global deploys
    throw new Error(
      "DEV_GUILD_ID not set. Refusing to deploy globally. Set DEV_GUILD_ID or pass --clear-global/--list."
    );
  }

  if (LIST) {
    await list();
    return;
  }

  if (CLEAR_GLOBAL) {
    console.log("Clearing ALL GLOBAL commands...");
    await rest.put(Routes.applicationCommands(APP_ID), { body: [] });
    console.log(
      "✅ Global commands have been cleared (UI may cache for a bit)."
    );
  }
}

main().catch((e) => {
  console.error("❌ Failed to register commands: ", e);
  process.exit(1);
});
