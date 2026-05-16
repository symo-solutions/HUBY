/**
 * Énumérations applicatives.
 *
 * On définit ces énumérations sous forme d'objets `const` (et non d'enums
 * Prisma) pour que le schéma fonctionne aussi bien sur SQLite (dev) que
 * sur PostgreSQL (prod), sans changer le code applicatif. Le schéma Prisma
 * stocke ces valeurs en TEXT/VARCHAR ; la validation à l'exécution se
 * trouve ici.
 */

export const Platform = {
  META: "META",
  GOOGLE: "GOOGLE",
} as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const CampaignStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ARCHIVED: "ARCHIVED",
  UNKNOWN: "UNKNOWN",
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const RuleType = {
  PAUSE_LOW_ROAS: "PAUSE_LOW_ROAS",
  INCREASE_BUDGET_HIGH_ROAS: "INCREASE_BUDGET_HIGH_ROAS",
  FLAG_LOW_CTR: "FLAG_LOW_CTR",
  ALERT_NO_CONVERSION: "ALERT_NO_CONVERSION",
} as const;
export type RuleType = (typeof RuleType)[keyof typeof RuleType];

export const LogAction = {
  CAMPAIGN_PAUSED: "CAMPAIGN_PAUSED",
  BUDGET_INCREASED: "BUDGET_INCREASED",
  CAMPAIGN_FLAGGED: "CAMPAIGN_FLAGGED",
  ALERT_GENERATED: "ALERT_GENERATED",
  RULE_EVALUATED: "RULE_EVALUATED",
} as const;
export type LogAction = (typeof LogAction)[keyof typeof LogAction];

export const LogStatus = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;
export type LogStatus = (typeof LogStatus)[keyof typeof LogStatus];

// Tuples utilisés par les schémas zod (z.enum())
export const PLATFORM_VALUES = ["META", "GOOGLE"] as const;
export const CAMPAIGN_STATUS_VALUES = [
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
  "UNKNOWN",
] as const;
export const RULE_TYPE_VALUES = [
  "PAUSE_LOW_ROAS",
  "INCREASE_BUDGET_HIGH_ROAS",
  "FLAG_LOW_CTR",
  "ALERT_NO_CONVERSION",
] as const;
export const LOG_ACTION_VALUES = [
  "CAMPAIGN_PAUSED",
  "BUDGET_INCREASED",
  "CAMPAIGN_FLAGGED",
  "ALERT_GENERATED",
  "RULE_EVALUATED",
] as const;
export const LOG_STATUS_VALUES = ["SUCCESS", "FAILED", "SKIPPED"] as const;
