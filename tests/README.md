# Testing Guide

## Overview

The Quil bot uses **Vitest** for automated testing with a three-tier approach:
1. **Unit tests** - Domain logic (XP, rewards, resource calculations)
2. **Integration tests** - Database operations (character lifecycle, LFG workflow)
3. **Command tests** - (Future) Discord interaction handlers

## Running Tests

```powershell
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-run on changes)
npm run test:ui       # Visual UI for debugging
npm run test:coverage # Generate coverage report
```

## Test Structure

```
tests/
├── fixtures/
│   ├── test-db.ts          # In-memory SQLite utilities
│   └── mock-interactions.ts # Discord interaction mocks
├── unit/
│   ├── xp.test.ts          # XP calculations, level advancement
│   └── rewards.test.ts     # Reward computations, resource deltas
└── integration/
    ├── character-lifecycle.test.ts  # Initiate, gain/spend resources, retire
    └── lfg-workflow.test.ts         # Toggle, purge, board aggregation
```

## Writing Tests

### Unit Tests (Domain Logic)

Test pure functions from `src/domain/`:

```typescript
import { describe, it, expect } from 'vitest';
import { levelForXP } from '../../src/domain/xp.js';

describe('XP Calculations', () => {
  it('should return correct level for XP', () => {
    expect(levelForXP(0)).toBe(1);
    expect(levelForXP(300)).toBe(2);
  });
});
```

### Integration Tests (Database Operations)

Use in-memory SQLite with test fixtures:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, seedTestPlayer, cleanupTestDb } from '../fixtures/test-db.js';

describe('Character Operations', () => {
  let db;

  beforeEach(async () => {
    db = await createTestDb(); // Fresh in-memory DB
  });

  afterEach(async () => {
    await cleanupTestDb(db); // Cleanup
  });

  it('should create character', async () => {
    await seedTestPlayer(db, {
      userId: 'user123',
      name: 'Hero',
      level: 5,
      active: true,
    });

    const char = await db.get('SELECT * FROM charlog WHERE userId = ?', 'user123');
    expect(char?.level).toBe(5);
  });
});
```

### Test Utilities

**`createTestDb()`**  
Creates in-memory SQLite database with full schema (charlog, lfg_status, etc.).

**`seedTestPlayer(db, options)`**  
Inserts a character with defaults:
- `userId` (required)
- `name` (required)
- `level` (default: 1)
- `xp`, `cp`, `tp`, `dtp`, `cc` (default: 0)
- `active` (default: true)

**`cleanupTestDb(db)`**  
Closes database connection.

**`createMockInteraction(options)`**  
(Future) Mock Discord interaction for command tests.

## Coverage

Run `npm run test:coverage` to generate reports in `coverage/` directory.

**Focus areas**:
- Domain logic (xp.ts, rewards.ts, resource.ts)
- Database queries (db_queries.ts, db/lfg.ts)
- Character lifecycle workflows
- LFG tier assignments and purging

**Not covered** (by design):
- Discord.js library code
- Network requests to Discord API
- Command registration scripts

## Best Practices

1. **Isolate tests** - Use `beforeEach` to create fresh DB instances
2. **Test behavior, not implementation** - Focus on inputs/outputs, not internal details
3. **Use descriptive test names** - "should add XP without leveling" vs "test XP"
4. **Avoid magic numbers** - Use advancement.json values, not hardcoded XP thresholds
5. **Test edge cases** - Level 1, level 20, negative values, missing data

## Troubleshooting

**Tests failing with "SQLITE_CONSTRAINT"**  
- Check schema in [tests/fixtures/test-db.ts](tests/fixtures/test-db.ts) matches production
- Ensure all NOT NULL columns have values in seed data

**Import errors**  
- Use `.js` extensions: `import { x } from './file.js'` (even for `.ts` files)
- Check ES module config in vitest.config.ts

**Slow tests**  
- Use in-memory DB (`:memory:`) not file-based
- Avoid unnecessary `beforeEach` setup
- Parallelize independent test files

## Future Improvements

- [ ] Command-level tests with mocked Discord interactions
- [ ] i18n string validation (missing keys, placeholder checks)
- [ ] Migration tests (apply migrations to various DB states)
- [ ] Performance benchmarks for large character rosters
- [ ] Snapshot tests for embed formatting
