// core/bot.ts
import {
  Client,
  GatewayIntentBits,
  Events,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";

import * as fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import { CONFIG } from "../config/resolved.js";
import { initDb } from "../db/index.js";

import * as retire from "../commands/retire.js";
import { t } from "../lib/i18n.js";
import { loadCharCacheFromDB, loadStoryCacheFromDB } from "../utils/db_queries.js";
import { autocomplete } from "../utils/autocomplete.js";

// figure out if we're executing from dist or src

// commmand-registry
type CommandModule = {
  data?: SlashCommandBuilder;
  execute?: (i: ChatInputCommandInteraction) => Promise<void>;
};

const commands = new Map<string, CommandModule>();

// dynamically load commands from the commands directory
async function loadCommands() {
  // determine if we're running from src/ or dist/
  const here = fileURLToPath(new URL(".", import.meta.url));
  const isBuilt = here.includes(`${path.sep}dist${path.sep}`);
  const commandsDir = path.resolve(here, "../commands");
  const ext = isBuilt ? ".js" : ".ts";

  console.log(`Loading commands from ${commandsDir} (built=${isBuilt})`);

  const files = fsSync
    .readdirSync(commandsDir)
    .filter(
      (f) => f.endsWith(ext) && !f.endsWith(".d.ts") && !f.endsWith(".map")
    );

  console.log(
    `Command files found (${ext}):`,
    files.map((f) => path.join(commandsDir, f))
  );

  for (const f of files) {
    try {
      const full = path.join(commandsDir, f); // ✅ join directory + filename
      const mod: CommandModule = await import(pathToFileURL(full).href);
      if (!mod?.data?.name) {
        console.warn(`⚠️  Skipping ${full}: no export 'data' with a name`);
        continue;
      }
      const cmdJSON = mod.data.toJSON();
      if (isDevelopment){
        // Modify the name dynamically
        cmdJSON.name = `dev_${cmdJSON.name}`;
      }
      commands.set(cmdJSON.name, mod);
    } catch (err) {
      console.error(`❌ Failed to import ${f}:`, err);
    }
  }
  console.log(`Loaded ${commands.size} slash commands.`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const guildId = CONFIG.guild!.id;
const guildCfg = CONFIG.guild!.config;

if (!guildCfg) {
  throw new Error(
    `[config] GuildId "${guildId}" not found. Please set up your guild ID in config in src/config/app.config.ts`
  );
}

client.on(Events.InteractionCreate, async (interaction) => {
  // slash command handler
  if (interaction.isChatInputCommand()) {
    const mod = commands.get(interaction.commandName);
    if (!mod?.execute) {
      const msg = t("errors.generic") || "Command not found."; // should never happen
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: msg,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: msg,
          flags: MessageFlags.Ephemeral,
        });
      }
      return; // rather not deal with it past this point.
    }
    try {
      await mod.execute(interaction);
    } catch (err) {
      console.error(`[/${interaction.commandName}]`, err);
      const msg =
        t("errors.generic") || "An error occurred while executing the command.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: msg,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.reply({
          content: msg,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    return autocomplete(interaction);
  }

  if (interaction.isModalSubmit()) {
    //dynamically dispatch if you add more modals later.
    if (interaction.customId.startsWith("retire-confirm-")) {
      try {
        await retire.handleModal(interaction);
      } catch (err) {
        console.error("[Retire Modal]", err);
        const msg =
          t("errors.generic") ||
          "An error occurred while processing the modal.";
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: msg,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: msg,
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }
  }
});

client.once(Events.ClientReady, async () => {
  await loadCommands();
  await initDb();
  await loadCharCacheFromDB();
  await loadStoryCacheFromDB();
  console.log(
    `Ready as ${client.user?.tag}. Guild: ${guildId} (${guildCfg.name})`
  );
});
const DEV_TOKEN = CONFIG.secrets.devToken;
const isDevelopment = process.argv.includes("--dev");

if (isDevelopment) {
  console.log("🚀 Starting in development mode...");
  client.login(DEV_TOKEN).catch(() => {
    console.error(
      "❌ Failed to login to Discord. Please check your DEV_DISCORD_TOKEN."
    );
    process.exit(1);
  });
} else {
  console.log("🚀 Starting in production mode...");
  client.login(CONFIG.secrets.token).catch(() => {
    console.error(
      "❌ Failed to login to Discord. Please check your DISCORD_TOKEN."
    );
    process.exit(1);
  });
}

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("Received SIGINT, shutting down...");
  await client.destroy();
  process.exit(0);
});

// on unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// on uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
  process.exit(1);
});

// on warnings
process.on("warning", (warning) => {
  console.warn("Warning:", warning);
});
