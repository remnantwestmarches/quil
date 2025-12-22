import dmrewards from "../../config/dmrewards.json" with { type: "json" };

import { applyXP } from "./xp.js";

/** Public Type */
export type ResourceDelta = { xp?: number; cp?: number; tp: number };

/* Internals */
type RewardRow = {
  level: number;
  tier: "low" | "mid" | "high" | "epic";
  xp: number;
  gp: number; // in GP
  tp: number; // in GT (displayed)
};

type RewardsTable = { levels: RewardRow[] };
const DM_CFG: RewardsTable = dmrewards as RewardsTable;


function getDmRow(level: number): RewardRow {
  const L = Math.max(1, Math.min(20, Math.floor(level || 1)));
  const row = DM_CFG.levels.find(r => r.level === L);
  if (row) return row;

  // Extremely defensive: fall back to nearest lower row or level 1
  const sorted = [...DM_CFG.levels].sort((a, b) => a.level - b.level);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const item = sorted[i];
    if (item && item.level <= L) return item;
  }
  const fallback = sorted[0];
  if (!fallback) throw new Error("No reward levels configured");
  return fallback;
  
}

/** Public API */

// Manual reward (bulk add). Input is human-first: xp (int), gp (in GP), tp (GT/TP).
export function computeCustomReward(input: { xp?: number; gp?: number; tp?: number }): ResourceDelta {
  const xp = Math.max(0, Math.floor(input.xp ?? 0));
  const cp = Math.max(0, Math.round((input.gp ?? 0) * 100)); // GP → cp
  const tp = Math.max(0, Number(input.tp ?? 0));             // use as-is (no doubling)
  return { xp, cp, tp };
}

// DM self-claim: read exact values from dmrewards.json for the active character level.
export function computeDmReward(level: number, half: boolean): ResourceDelta {
  const rec = getDmRow(level);
  const mult = half ? 0.5 : 1;
  const xp = Math.round(Math.max(0, Math.floor(rec.xp) * mult));
  const cp = Math.round(Math.max(0, Math.round(rec.gp * 100) * mult)); // GP → cp
  const tp = Math.round(Math.max(0, Number(rec.tp) * mult));           // as-is
  return { xp, cp, tp };
}

// Apply any resource delta to a player snapshot, with auto-leveling
export function applyResourceDeltas(
  prev: { xp: number; level: number; cp: number; tp: number },
  delta: ResourceDelta
) {
  // XP/level via advancement table (xp.ts)
  const res = applyXP({ xp: prev.xp, level: prev.level }, Math.floor(delta.xp ?? 0));

  // Currency/GT (clamped >= 0)
  const nextCp = Math.max(0, prev.cp + (delta.cp ?? 0));
  const nextTp = Math.max(0, prev.tp + (delta.tp ?? 0));

  return {
    xp: res.xp,
    level: res.level,
    levelsChanged: res.levelsChanged,
    proficiency: res.proficiency,
    cp: nextCp,
    tp: nextTp
  };
}
