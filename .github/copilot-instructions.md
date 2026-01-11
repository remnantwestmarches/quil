# Quil Bot Development Guide

## Project Overview

**Quil** is a modern Discord.js v14 bot for D&D guilds, managing character progression, resource tracking, and guild operations with a charming "ledger quill" personality. Built with TypeScript, SQLite, and slash commands.

## Architecture & Key Components

### Command System
- Commands auto-load from [src/commands/](src/commands/) via [src/core/bot.ts](src/core/bot.ts#L30-L67)
- Each command exports `data` (SlashCommandBuilder) and `execute` (async handler)
- Dev mode prefixes commands with `dev_` to avoid conflicts
- Register commands: `npm run deploy:dev` (guild) or `npm run deploy:prod` (production)

### Database Layer
- SQLite with WAL mode ([src/db/index.ts](src/db/index.ts))
- Primary table: `charlog` (userId, name, level, xp, cp, tp, dtp, cc, active)
- Active character concept: each user has one active character (active=1)
- Use `getPlayer(userId, name?)`, `getPlayerCC(userId)`, and `adjustResource(userId, columns, values)` from [src/utils/db_queries.ts](src/utils/db_queries.ts)
- Initialize: `npm run db:init`, migrate: `npm run db:migrate`

### Configuration System
- [src/config/app.config.ts](src/config/app.config.ts): Guild defaults (roles, channels, features) - NOT secrets
- [src/config/resolved.ts](src/config/resolved.ts): Runtime config merging .env with defaults via Zod validation
- Required env vars: `DISCORD_TOKEN`, `APP_ID`, `GUILD_ID` (see [.env.example](.env.example))
- Access via `CONFIG` import, e.g., `CONFIG.guild.config.channels.resourceTracking`

### Localization (i18n)
- All user-facing text lives in [config/strings/en/](config/strings/en/) JSON files
- Use `t(key, params)` from [src/lib/i18n.ts](src/lib/i18n.ts) for translations
- Supports nested keys (`buy.purchaseSuccess`), placeholders (`{item}`, `{amount}`), and random variants (arrays)
- Reload strings: call `reloadStrings()` or restart bot

### Domain Logic
- [src/domain/rewards.ts](src/domain/rewards.ts): XP/GP/GT calculations, DM reward tables from [config/dmrewards.json](config/dmrewards.json)
- [src/domain/xp.ts](src/domain/xp.ts): Level advancement curves from [config/advancement.json](config/advancement.json)
- [src/domain/lfg.ts](src/domain/lfg.ts): LFG tier aggregation, embed building, auto-tier assignment by level
- [src/domain/resource.ts](src/domain/resource.ts): Time-based resource regeneration (DTP daily accrual)
- Resource units: `cp` (copper, 100cp = 1GP), `tp` (Guild Tokens/GT), `dtp` (downtime points), `cc` (Crew Coins, player-level resource)
- Special entities: Guild fund uses system userId `sys:fund:remnant` in charlog table
- Player-level resources: `cc` is summed across all user's characters via `getPlayerCC(userId)`

## Development Workflows

### Local Development
```powershell
npm ci                      # Install dependencies
cp .env.example .env        # Configure secrets
npm run db:init             # Create database
npm run deploy:dev          # Register slash commands
npm run dev                 # Start with hot reload (tsx watch)
npm test                    # Run test suite (optional)
```

### Adding a New Command
1. Create `src/commands/mycommand.ts` with exports: `data`, `execute`
2. Use `SlashCommandBuilder` for command definition
3. Channel guards: check `ix.channelId === CONFIG.guild.config.channels.X`
4. Role guards: Use `member.roles.cache.has(roleId)` for permission checks (e.g., CC crew-only restriction in buy command)
5. Strings: Add translations to appropriate [config/strings/en/](config/strings/en/) file
6. Re-register: `npm run deploy:dev`
7. Write tests: Add unit tests for logic, integration tests for DB operations

### Adding a New Resource Type
1. **Database**: Add column to `charlog` table via migration in [src/db/index.ts](src/db/index.ts) `migrateDb()`
2. **Type**: Update `PlayerRow` type in [src/utils/db_queries.ts](src/utils/db_queries.ts)
3. **Query allowlist**: Add column name to `allowed` array in `adjustResource()`
4. **Domain logic**: Add conversion/calculation functions if needed (see [src/domain/resource.ts](src/domain/resource.ts) for DTP example)
5. **Commands**: Update buy/sell/resource commands to handle new type
6. **Strings**: Add user-facing labels to [config/strings/en/](config/strings/en/) files
7. **Config**: Add tracking channel to [src/config/app.config.ts](src/config/app.config.ts) if needed

### Database Migrations
- **Pattern**: Check column exists with `pragma_table_info` before `ALTER TABLE`
- **Location**: All migrations live in [src/db/index.ts](src/db/index.ts) `migrateDb()` function
- **Run**: `npm run db:migrate` applies all migrations to existing DB
- **Example**:
  ```typescript
  const check = await db.get(`SELECT * FROM pragma_table_info('charlog') WHERE name = 'new_col';`);
  if (!check) {
    await db.exec(`ALTER TABLE charlog ADD COLUMN new_col INTEGER NOT NULL DEFAULT 0;`);
  }
  ```
- **Testing**: Use `npm run db:wipe && npm run db:init` locally, but migrations are for production DBs
- **Note**: SQLite limitations - can't drop columns easily, plan schema changes carefully

### Production Deployment
```powershell
npm ci                      # Clean install
npm run build               # Compile TypeScript
npm run deploy:prod         # Register to production guild
systemctl restart bissel    # Restart service (or pm2)
```

## Code Conventions

### Personality & Strings
- Quil speaks with **dry wit, ledger metaphors, and gentle sarcasm** (see [docs/PERSONALITY.md](docs/PERSONALITY.md))
- Never hardcode user-facing text - always use `t(key, params)`
- Provide string variants (arrays) for flavor variety
- One emoji max per message: 🪶 📜 💰 🎫 preferred

### Error Handling
- Use `MessageFlags.Ephemeral` for errors and confirmations
- Check `interaction.deferred || interaction.replied` before followUp
- Gate commands by channel/role before executing logic
- Example pattern:
  ```typescript
  if (ix.channelId !== ALLOWED_CHANNEL) {
    return ix.reply({ flags: MessageFlags.Ephemeral, content: t('errors.wrongChannel') });
  }
  ```

### TypeScript Patterns
- Strict mode enabled with `noUncheckedIndexedAccess`
- ES modules only (`type: "module"` in package.json)
- Always `.js` extensions in imports (even for `.ts` files)
- Use `resolveJsonModule` for config JSON imports with `with { type: "json" }`

### Testing
**Framework**: Vitest with in-memory SQLite for fast, isolated tests
- `npm test` - Run all tests
- `npm run test:watch` - Watch mode (auto-rerun on changes)
- `npm run test:ui` - Visual debugging UI
- `npm run test:coverage` - Generate coverage report

**Test Structure** ([tests/](tests/)):
- **Unit tests** ([tests/unit/](tests/unit/)) - Domain logic (xp.ts, rewards.ts) pure functions
- **Integration tests** ([tests/integration/](tests/integration/)) - Character lifecycle, LFG workflow with in-memory DB
- **Fixtures** ([tests/fixtures/](tests/fixtures/)) - `createTestDb()`, `seedTestPlayer()`, mock Discord interactions

**Coverage** (45 passing tests):
- XP calculations, level advancement, proficiency bands
- Reward computations (DM rewards, custom rewards, resource deltas)
- Character lifecycle (initiate, gain/spend resources, retirement with CC transfer)
- LFG workflow (toggle tiers, auto-assignment, purge with PBP exclusion, board aggregation)

**Future improvements**:
- Command-level tests with mocked Discord interactions
- i18n string validation (missing keys, placeholder mismatches)
- Migration tests (apply migrations to various DB states)

## Critical Files Reference
LFG System (Active Feature)

### Architecture
- **DB**: [src/db/lfg.ts](src/db/lfg.ts) - CRUD operations for `lfg_status` table
- **Domain**: [src/domain/lfg.ts](src/domain/lfg.ts) - Tier logic, board aggregation, embed formatting
- **Command**: [src/commands/lfg.ts](src/commands/lfg.ts) - `/lfg add`, `/lfg remove`, `/lfg toggle`, board posting
- **State**: Persistent board message ID stored in `guild_state` table

### Workflow
1. User toggles tier availability via `/lfg toggle <tier>`
2. Auto-assigns tier roles (Low/Mid/High/Epic/PBP) based on active flags
3. Board embed updates show players grouped by tier with "days LFG" counter
4. Moderators post/update sticky board with `/lfg post`
5. `startedAt` timestamp tracks when first tier was enabled (for "X DAYS LFG")
6. `/lfg purge days:X` removes stale entries - **default scope excludes PBP** (only purges low/mid/high/epic)

### Key Implementation Details
- **PBP exclusion**: Default purge uses `WHERE (low=1 OR mid=1 OR high=1 OR epic=1)` to skip PBP tier
- **Explicit PBP purge**: Use `scope:pbp` parameter to purge PBP entries specifically
- **Role removal**: Purge only removes tier roles that match the purge scope

### Future Improvements
- Consider debouncing role syncs if Discord rate limits become an issue
- Board auto-refresh on timer instead of manual `/lfg post`
- DM ping notification system when new players join LFG tiers
- Archive/stats for completed sessions (link LFG entries to session logs)

## Common Pitfalls

- **Forgot to register commands?** Run `npm run deploy:dev` after creating/editing commands
- **Strings not updating?** Restart bot - strings load once on startup
- **Wrong channel errors?** Check channel IDs in [src/config/app.config.ts](src/config/app.config.ts)
- **Database locked?** Close other connections; WAL mode helps but check `busy_timeout`
- **Import errors?** Use `.js` extensions even for TypeScript files (ES modules requirement)
- **Migration not running?** Ensure `pragma_table_info` check logic is correct and column name matches exactly|
| [src/config/app.config.ts](src/config/app.config.ts) | Guild structure defaults |
| [src/scripts/register-commands.ts](src/scripts/register-commands.ts) | Slash command registration |

## Common Pitfalls

- **Forgot to register commands?** Run `npm run deploy:dev` after creating/editing commands
- **Strings not updating?** Restart bot - strings load once on startup
- **Wrong channel errors?** Check channel IDs in [src/config/app.config.ts](src/config/app.config.ts)
- **Database locked?** Close other connections; WAL mode helps but check `busy_timeout`
- **Import errors?** Use `.js` extensions even for TypeScript files (ES modules requirement)
