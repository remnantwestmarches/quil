// Unit tests for XP domain logic
import { describe, it, expect } from 'vitest';
import { levelForXP, proficiencyFor, applyXP, bandFor } from '../../src/domain/xp.js';

describe('XP Domain Logic', () => {
  describe('levelForXP', () => {
    it('should return level 1 for 0 XP', () => {
      expect(levelForXP(0)).toBe(1);
    });

    it('should return level 2 for 300 XP', () => {
      expect(levelForXP(300)).toBe(2);
    });

    it('should return level 5 for 6500 XP', () => {
      expect(levelForXP(6500)).toBe(5);
    });

    it('should return level 20 for 355000 XP', () => {
      expect(levelForXP(355000)).toBe(20);
    });

    it('should handle edge case at level boundary', () => {
      expect(levelForXP(299)).toBe(1);
      expect(levelForXP(300)).toBe(2);
    });
  });

  describe('proficiencyFor', () => {
    it('should return +2 for levels 1-4', () => {
      expect(proficiencyFor(1)).toBe(2);
      expect(proficiencyFor(4)).toBe(2);
    });

    it('should return +3 for levels 5-8', () => {
      expect(proficiencyFor(5)).toBe(3);
      expect(proficiencyFor(8)).toBe(3);
    });

    it('should return +6 for level 20', () => {
      expect(proficiencyFor(20)).toBe(6);
    });
  });

  describe('applyXP', () => {
    it('should add XP without leveling up', () => {
      const result = applyXP({ xp: 100, level: 1 }, 50);
      expect(result.xp).toBe(150);
      expect(result.level).toBe(1);
      expect(result.levelsChanged).toBe(0);
    });

    it('should level up when crossing threshold', () => {
      const result = applyXP({ xp: 250, level: 1 }, 100);
      expect(result.xp).toBe(350);
      expect(result.level).toBe(2);
      expect(result.levelsChanged).toBe(1);
    });

    it('should handle multiple level ups', () => {
      const result = applyXP({ xp: 0, level: 1 }, 7000);
      expect(result.xp).toBe(7000);
      expect(result.level).toBe(5);
      expect(result.levelsChanged).toBe(4);
    });

    it('should not go below 0 XP', () => {
      const result = applyXP({ xp: 100, level: 2 }, -200);
      expect(result.xp).toBe(0);
      expect(result.level).toBe(1);
    });
  });

  describe('bandFor', () => {
    it('should return correct band for level 1', () => {
      const band = bandFor(1);
      expect(band.curr).toBe(0);
      expect(band.next).toBe(300);
    });

    it('should return correct band for level 5', () => {
      const band = bandFor(5);
      expect(band.curr).toBe(6500);
      expect(band.next).toBe(14000);
    });

    it('should return null for next at level 20', () => {
      const band = bandFor(20);
      expect(band.curr).toBe(355000);
      expect(band.next).toBeNull();
    });
  });
});
