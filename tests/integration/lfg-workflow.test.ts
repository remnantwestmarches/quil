// Integration tests for LFG workflow
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Sqlite } from '../../src/db/index.js';
import { createTestDb, seedTestPlayer, cleanupTestDb } from '../fixtures/test-db.js';

describe('LFG Workflow Integration', () => {
  let db: Sqlite;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await cleanupTestDb(db);
  });

  describe('Toggling LFG Status', () => {
    it('should enable a tier and set startedAt', async () => {
      const userId = 'user123';
      const now = Date.now();

      await db.run(
        `INSERT OR REPLACE INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, 'test-guild', 'TestUser', 1, 0, 0, 0, 0, now, now
      );

      const status = await db.get(
        `SELECT * FROM lfg_status WHERE userId = ?`,
        userId
      );

      expect(status?.low).toBe(1);
      expect(status?.startedAt).toBe(now);
    });

    it('should disable all tiers and clear startedAt', async () => {
      const now = Date.now();
      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'user123', 'test-guild', 'TestUser', 1, 1, 0, 0, 0, now, now
      );

      await db.run(
        `UPDATE lfg_status SET low = 0, mid = 0, high = 0, epic = 0, pbp = 0, startedAt = 0
         WHERE userId = ?`,
        'user123'
      );

      const status = await db.get(
        `SELECT * FROM lfg_status WHERE userId = ?`,
        'user123'
      );

      expect(status?.low).toBe(0);
      expect(status?.mid).toBe(0);
      expect(status?.startedAt).toBe(0);
    });

    it('should toggle multiple tiers simultaneously', async () => {
      const now = Date.now();
      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'user123', 'test-guild', 'TestUser', 1, 1, 1, 0, 0, now, now
      );

      const status = await db.get(
        `SELECT * FROM lfg_status WHERE userId = ?`,
        'user123'
      );

      expect(status?.low).toBe(1);
      expect(status?.mid).toBe(1);
      expect(status?.high).toBe(1);
      expect(status?.epic).toBe(0);
    });
  });

  describe('Auto-tier Assignment by Level', () => {
    it('should assign Low tier for levels 1-4', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Newbie',
        level: 3,
        active: true,
      });

      const char = await db.get(
        `SELECT level FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      const tier = char!.level >= 1 && char!.level <= 4 ? 'low' :
                   char!.level >= 5 && char!.level <= 10 ? 'mid' :
                   char!.level >= 11 && char!.level <= 16 ? 'high' :
                   'epic';

      expect(tier).toBe('low');
    });

    it('should assign Mid tier for levels 5-10', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Journeyman',
        level: 7,
        active: true,
      });

      const char = await db.get(
        `SELECT level FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      const tier = char!.level >= 1 && char!.level <= 4 ? 'low' :
                   char!.level >= 5 && char!.level <= 10 ? 'mid' :
                   char!.level >= 11 && char!.level <= 16 ? 'high' :
                   'epic';

      expect(tier).toBe('mid');
    });

    it('should assign High tier for levels 11-16', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Veteran',
        level: 13,
        active: true,
      });

      const char = await db.get(
        `SELECT level FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      const tier = char!.level >= 1 && char!.level <= 4 ? 'low' :
                   char!.level >= 5 && char!.level <= 10 ? 'mid' :
                   char!.level >= 11 && char!.level <= 16 ? 'high' :
                   'epic';

      expect(tier).toBe('high');
    });

    it('should assign Epic tier for levels 17+', async () => {
      await seedTestPlayer(db, {
        userId: 'user123',
        name: 'Legend',
        level: 20,
        active: true,
      });

      const char = await db.get(
        `SELECT level FROM charlog WHERE userId = ? AND active = 1`,
        'user123'
      );

      const tier = char!.level >= 1 && char!.level <= 4 ? 'low' :
                   char!.level >= 5 && char!.level <= 10 ? 'mid' :
                   char!.level >= 11 && char!.level <= 16 ? 'high' :
                   'epic';

      expect(tier).toBe('epic');
    });
  });

  describe('LFG Purge', () => {
    it('should purge entries older than specified days (default scope)', async () => {
      const oldDate = Date.now() - (10 * 24 * 60 * 60 * 1000);
      const newDate = Date.now();

      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'oldUser', 'test-guild', 'OldUser', 1, 0, 0, 0, 0, oldDate, oldDate
      );

      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'newUser', 'test-guild', 'NewUser', 1, 0, 0, 0, 0, newDate, newDate
      );

      const threshold = Date.now() - (7 * 24 * 60 * 60 * 1000);

      await db.run(
        `UPDATE lfg_status 
         SET low = 0, mid = 0, high = 0, epic = 0, startedAt = 0
         WHERE (low = 1 OR mid = 1 OR high = 1 OR epic = 1) 
         AND startedAt < ?`,
        threshold
      );

      const oldStatus = await db.get(
        `SELECT * FROM lfg_status WHERE userId = ?`,
        'oldUser'
      );
      const newStatus = await db.get(
        `SELECT * FROM lfg_status WHERE userId = ?`,
        'newUser'
      );

      expect(oldStatus?.low).toBe(0);
      expect(oldStatus?.startedAt).toBe(0);
      expect(newStatus?.low).toBe(1);
      expect(newStatus?.startedAt).toBeGreaterThan(0);
    });

    it('should NOT purge PBP entries in default scope', async () => {
      const oldDate = Date.now() - (10 * 24 * 60 * 60 * 1000);

      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'pbpUser', 'test-guild', 'PBPUser', 0, 0, 0, 0, 1, oldDate, oldDate
      );

      const threshold = Date.now() - (7 * 24 * 60 * 60 * 1000);

      // Default purge should not affect PBP
      await db.run(
        `UPDATE lfg_status 
         SET low = 0, mid = 0, high = 0, epic = 0, startedAt = 0
         WHERE (low = 1 OR mid = 1 OR high = 1 OR epic = 1) 
         AND startedAt < ?`,
        threshold
      );

      const status = await db.get(
        `SELECT * FROM lfg_status WHERE userId = ?`,
        'pbpUser'
      );

      expect(status?.pbp).toBe(1);
      expect(status?.startedAt).toBe(oldDate);
    });

    it('should purge PBP when explicitly scoped', async () => {
      const oldDate = Date.now() - (10 * 24 * 60 * 60 * 1000);

      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'pbpUser', 'test-guild', 'PBPUser', 0, 0, 0, 0, 1, oldDate, oldDate
      );

      const threshold = Date.now() - (7 * 24 * 60 * 60 * 1000);

      // Explicit PBP purge
      await db.run(
        `UPDATE lfg_status 
         SET pbp = 0, startedAt = 0
         WHERE pbp = 1 AND startedAt < ?`,
        threshold
      );

      const status = await db.get(
        `SELECT * FROM lfg_status WHERE userId = ?`,
        'pbpUser'
      );

      expect(status?.pbp).toBe(0);
      expect(status?.startedAt).toBe(0);
    });
  });

  describe('Board Aggregation', () => {
    it('should group players by tier', async () => {
      const now = Date.now();
      await seedTestPlayer(db, { userId: 'user1', name: 'Low1', level: 2, active: true });
      await seedTestPlayer(db, { userId: 'user2', name: 'Low2', level: 3, active: true });
      await seedTestPlayer(db, { userId: 'user3', name: 'Mid1', level: 7, active: true });

      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'user1', 'test-guild', 'Low1', 1, 0, 0, 0, 0, now, now
      );
      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'user2', 'test-guild', 'Low2', 1, 0, 0, 0, 0, now, now
      );
      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'user3', 'test-guild', 'Mid1', 0, 1, 0, 0, 0, now, now
      );

      const lowPlayers = await db.all(
        `SELECT c.userId, c.name, c.level, l.startedAt
         FROM lfg_status l
         JOIN charlog c ON l.userId = c.userId AND c.active = 1
         WHERE l.low = 1`,
      );

      const midPlayers = await db.all(
        `SELECT c.userId, c.name, c.level, l.startedAt
         FROM lfg_status l
         JOIN charlog c ON l.userId = c.userId AND c.active = 1
         WHERE l.mid = 1`,
      );

      expect(lowPlayers).toHaveLength(2);
      expect(midPlayers).toHaveLength(1);
      expect(lowPlayers.map(p => p.name)).toContain('Low1');
      expect(lowPlayers.map(p => p.name)).toContain('Low2');
      expect(midPlayers[0]?.name).toBe('Mid1');
    });

    it('should calculate days LFG from startedAt', async () => {
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);

      await seedTestPlayer(db, { userId: 'user123', name: 'Waiting', level: 5, active: true });
      await db.run(
        `INSERT INTO lfg_status (userId, guildId, name, low, mid, high, epic, pbp, startedAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'user123', 'test-guild', 'Waiting', 0, 1, 0, 0, 0, threeDaysAgo, threeDaysAgo
      );

      const status = await db.get<{ startedAt: number }>(
        `SELECT startedAt FROM lfg_status WHERE userId = ?`,
        'user123'
      );

      const started = status!.startedAt;
      const now = Date.now();
      const daysLfg = Math.floor((now - started) / (1000 * 60 * 60 * 24));

      expect(daysLfg).toBe(3);
    });
  });
});
