// Unit tests for rewards domain logic
import { describe, it, expect } from 'vitest';
import { computeCustomReward, computeDmReward, applyResourceDeltas } from '../../src/domain/rewards.js';

describe('Rewards Domain Logic', () => {
  describe('computeCustomReward', () => {
    it('should convert GP to copper', () => {
      const reward = computeCustomReward({ gp: 10, xp: 0, tp: 0 });
      expect(reward.cp).toBe(1000); // 10 GP = 1000 cp
      expect(reward.xp).toBe(0);
      expect(reward.tp).toBe(0);
    });

    it('should handle fractional GP', () => {
      const reward = computeCustomReward({ gp: 5.5, xp: 100, tp: 2 });
      expect(reward.cp).toBe(550); // 5.5 GP = 550 cp
      expect(reward.xp).toBe(100);
      expect(reward.tp).toBe(2);
    });

    it('should clamp negative values to 0', () => {
      const reward = computeCustomReward({ gp: -10, xp: -50, tp: -5 });
      expect(reward.cp).toBe(0);
      expect(reward.xp).toBe(0);
      expect(reward.tp).toBe(0);
    });
  });

  describe('computeDmReward', () => {
    it('should return full DM reward for level 5', () => {
      const reward = computeDmReward(5, false);
      expect(reward.xp).toBeGreaterThan(0);
      expect(reward.cp).toBeGreaterThan(0);
      expect(reward.tp).toBeGreaterThan(0);
    });

    it('should return half DM reward when half=true', () => {
      const fullReward = computeDmReward(5, false);
      const halfReward = computeDmReward(5, true);
      
      expect(halfReward.xp).toBe(Math.round(fullReward.xp * 0.5));
      expect(halfReward.cp).toBe(Math.round(fullReward.cp * 0.5));
      expect(halfReward.tp).toBe(Math.round(fullReward.tp * 0.5));
    });

    it('should clamp level to 1-20 range', () => {
      const level0 = computeDmReward(0, false);
      const level1 = computeDmReward(1, false);
      expect(level0).toEqual(level1);

      const level25 = computeDmReward(25, false);
      const level20 = computeDmReward(20, false);
      expect(level25).toEqual(level20);
    });
  });

  describe('applyResourceDeltas', () => {
    it('should add resources without leveling', () => {
      const prev = { xp: 400, level: 2, cp: 500, tp: 5 };
      const delta = { xp: 50, cp: 200, tp: 2 };
      
      const result = applyResourceDeltas(prev, delta);
      expect(result.xp).toBe(450);
      expect(result.level).toBe(2);
      expect(result.cp).toBe(700);
      expect(result.tp).toBe(7);
      expect(result.levelsChanged).toBe(0);
    });

    it('should trigger level up', () => {
      const prev = { xp: 250, level: 1, cp: 0, tp: 0 };
      const delta = { xp: 100, cp: 0, tp: 0 };
      
      const result = applyResourceDeltas(prev, delta);
      expect(result.xp).toBe(350);
      expect(result.level).toBe(2);
      expect(result.levelsChanged).toBe(1);
    });

    it('should not allow negative resources', () => {
      const prev = { xp: 100, level: 2, cp: 50, tp: 1 };
      const delta = { xp: 0, cp: -100, tp: -5 };
      
      const result = applyResourceDeltas(prev, delta);
      expect(result.cp).toBe(0);
      expect(result.tp).toBe(0);
    });
  });
});
