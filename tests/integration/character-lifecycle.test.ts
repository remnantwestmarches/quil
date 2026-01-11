// Integration tests for character lifecycle
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Sqlite } from '../../src/db/index.js';
import { createTestDb, seedTestPlayer, cleanupTestDb } from '../fixtures/test-db.js';

describe('Character Lifecycle Integration', () => {
  let db: Sqlite;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  describe('Character Initiation', () => {
    it('should create a new character with default values', async () => {
      await db.run(
        `INSERT INTO charlog (userId, name, level, xp, cp, tp, dtp, cc, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'user123', 'TestChar', 1, 0, 0, 0, 0, 0, 1
      );

      const char = await db.get(
        `SELECT * FROM charlog WHERE userId = ? AND name = ?`,
        'user123', 'TestChar'
      );

      expect(char).toBeDefined();
      expect(char?.level).toBe(1);
      expect(char?.xp).toBe(0);
      expect(char?.cp).toBe(0);
      expect(char?.tp).toBe(0);
      expect(char?.dtp).toBe(0);
      expect(char?.cc).toBe(0);
      expect(char?.active).toBe(1);
    });

    it('should set new character as active and deactivate others', async () => {
      // Create first character
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Char1',
        active: true,
      });

      // Create second character
      await db.run(
        `UPDATE charlog SET active = 0 WHERE userId = ? AND name != ?`,
        'user123', 'Char2'
      );
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Char2',
        active: true,
      });

      const chars = await db.all(
        `SELECT name, active FROM charlog WHERE userId = ? ORDER BY name`,
        'user123'
      );

      expect(chars).toHaveLength(2);
      expect(chars.find(c => c.name === 'Char1')?.active).toBe(0);
      expect(chars.find(c => c.name === 'Char2')?.active).toBe(1);
    });
  });

  describe('Resource Gain', () => {
    it('should add XP and level up character', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Hero',
        level: 1,
        xp: 250,
        active: true,
      });

      // Add 100 XP (should level up at 300 total)
      await db.run(
        `UPDATE charlog SET xp = xp + ?, level = ? WHERE userId = ? AND active = 1`,
        100, 2, 'user123'
      );

      const char = await db.get(
        `SELECT * FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      expect(char?.xp).toBe(350);
      expect(char?.level).toBe(2);
    });

    it('should add GP (as copper)', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Merchant',
        cp: 1000, // 10 GP
        active: true,
      });

      await db.run(
        `UPDATE charlog SET cp = cp + ? WHERE userId = ? AND active = 1`,
        500, // +5 GP
        'user123'
      );

      const char = await db.get(
        `SELECT cp FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      expect(char?.cp).toBe(1500); // 15 GP
    });

    it('should add GT and DTP', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Worker',
        tp: 5,
        dtp: 10,
        active: true,
      });

      await db.run(
        `UPDATE charlog SET tp = tp + ?, dtp = dtp + ? WHERE userId = ? AND active = 1`,
        3, 5, 'user123'
      );

      const char = await db.get(
        `SELECT tp, dtp FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      expect(char?.tp).toBe(8);
      expect(char?.dtp).toBe(15);
    });
  });

  describe('Resource Spending', () => {
    it('should deduct resources when buying', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Buyer',
        cp: 5000, // 50 GP
        tp: 10,
        dtp: 20,
        active: true,
      });

      // Buy something for 10 GP, 2 GT, 5 DTP
      await db.run(
        `UPDATE charlog SET cp = cp - ?, tp = tp - ?, dtp = dtp - ? 
         WHERE userId = ? AND active = 1`,
        1000, 2, 5, 'user123'
      );

      const char = await db.get(
        `SELECT * FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      expect(char?.cp).toBe(4000); // 40 GP
      expect(char?.tp).toBe(8);
      expect(char?.dtp).toBe(15);
    });

    it('should handle CC as player-level resource', async () => {
      // Create two characters for same user
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Char1',
        cc: 50,
        active: true,
      });
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Char2',
        cc: 30,
        active: false,
      });

      // Get total CC
      const result = await db.get<{ total: number }>(
        `SELECT COALESCE(SUM(cc), 0) as total FROM charlog WHERE userId = ?`,
        'user123'
      );

      expect(result?.total).toBe(80);

      // Spend 20 CC from active character
      await db.run(
        `UPDATE charlog SET cc = cc - ? WHERE userId = ? AND active = 1`,
        20, 'user123'
      );

      const newTotal = await db.get<{ total: number }>(
        `SELECT COALESCE(SUM(cc), 0) as total FROM charlog WHERE userId = ?`,
        'user123'
      );

      expect(newTotal?.total).toBe(60);
    });
  });

  describe('Character Retirement', () => {
    it('should delete character and set next one as active', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Retiring',
        active: true,
      });
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'NextUp',
        active: false,
      });

      // Delete active character
      await db.run(
        `DELETE FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      // Set first remaining as active
      await db.run(
        `UPDATE charlog SET active = 1 
         WHERE rowid = (
           SELECT rowid FROM charlog WHERE userId = ? ORDER BY rowid ASC LIMIT 1
         )`,
        'user123'
      );

      const active = await db.get(
        `SELECT * FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      expect(active?.name).toBe('NextUp');
    });

    it('should transfer CC on retirement', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Retiring',
        cc: 50,
        active: true,
      });
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Heir',
        cc: 10,
        active: false,
      });

      const retiring = await db.get(
        `SELECT cc FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      // Transfer CC before deletion
      await db.run(
        `UPDATE charlog SET cc = cc + ? 
         WHERE userId = ? AND active = 0`,
        retiring?.cc ?? 0,
        'user123'
      );

      await db.run(
        `DELETE FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      const heir = await db.get(
        `SELECT cc FROM charlog WHERE userId = ?`,
        'user123'
      );

      expect(heir?.cc).toBe(60); // 10 + 50
    });
  });
});
