import { CONFIG } from "../config/resolved.js";
import { adjustResource, getPlayer } from "../utils/db_queries.js";

const CFG = CONFIG.guild!.config;
const ROLE = CFG.roles;
const DTP_RATE = CFG.features.dtp?.rate || 1;

export async function updateDTP(user: string, char: string = ""): Promise<number|null> {
  const row = await getPlayer(user, char)
  if (!row) { return null }
  const timestamp = Math.round(new Date().getTime() / 1000)
  const timestampNormal = timestamp - (timestamp % Math.round(86400 / DTP_RATE))
  const dtpcalc = row.dtp + ((timestampNormal - row.dtp_updated) / Math.round(86400 / DTP_RATE))
  return (await adjustResource(user, ["dtp", "dtp_updated"], [dtpcalc, timestampNormal], true, row.name))?.dtp ?? 0
}