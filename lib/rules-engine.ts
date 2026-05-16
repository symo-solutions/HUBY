/**
 * Moteur de règles d'automatisation.
 *
 * Pour chaque utilisateur, on charge ses règles activées + les données
 * récentes des campagnes et on applique chaque règle. Les effets de bord
 * (pause, mise à jour de budget) appellent les API Meta / Google, et on
 * enregistre une ligne AutomationLog pour chaque action.
 *
 * Règles supportées (MVP) :
 *  - PAUSE_LOW_ROAS            : ROAS < seuil pendant N jours → mise en pause
 *  - INCREASE_BUDGET_HIGH_ROAS : ROAS > seuil → +X % du budget journalier
 *  - FLAG_LOW_CTR              : CTR < seuil % → campagne signalée
 *  - ALERT_NO_CONVERSION       : dépense > seuil et 0 conversion → alerte
 */

import type {
  AdAccount,
  Campaign,
  CampaignMetric,
  AutomationRule,
} from "@prisma/client";
import {
  CampaignStatus,
  LogAction,
  LogStatus,
  Platform,
  RuleType,
} from "@/lib/enums";
import { prisma } from "@/lib/db";
import { fromJsonField, toJsonField } from "@/lib/json-field";
import {
  pauseMetaCampaign,
  updateMetaBudget,
} from "@/lib/meta-api";
import {
  pauseGoogleCampaign,
  updateGoogleBudget,
} from "@/lib/google-ads-api";

export const RULE_DEFAULTS: Record<
  RuleType,
  { threshold: number; windowDays: number; params: Record<string, unknown> }
> = {
  PAUSE_LOW_ROAS: { threshold: 1.0, windowDays: 3, params: {} },
  INCREASE_BUDGET_HIGH_ROAS: { threshold: 2.0, windowDays: 1, params: { increasePct: 20 } },
  FLAG_LOW_CTR: { threshold: 0.5, windowDays: 3, params: {} },
  ALERT_NO_CONVERSION: { threshold: 50, windowDays: 7, params: {} },
};

export const RULE_LABELS: Record<RuleType, string> = {
  PAUSE_LOW_ROAS: "Mettre en pause les campagnes à faible ROAS",
  INCREASE_BUDGET_HIGH_ROAS: "Augmenter le budget sur ROAS élevé",
  FLAG_LOW_CTR: "Signaler les campagnes à faible CTR",
  ALERT_NO_CONVERSION: "Alerter sur dépense sans conversion",
};

export const RULE_DESCRIPTIONS: Record<RuleType, string> = {
  PAUSE_LOW_ROAS:
    "Si le ROAS reste sous le seuil pendant N jours consécutifs, la campagne est mise en pause.",
  INCREASE_BUDGET_HIGH_ROAS:
    "Si le ROAS dépasse le seuil, le budget journalier est automatiquement augmenté du pourcentage configuré.",
  FLAG_LOW_CTR:
    "Si le CTR passe sous le seuil, la campagne est signalée pour examen manuel.",
  ALERT_NO_CONVERSION:
    "Si une campagne dépense plus que le seuil sans aucune conversion sur la fenêtre, une alerte est générée.",
};

type CampaignWithContext = Campaign & {
  adAccount: AdAccount;
  metrics: CampaignMetric[];
};

export type RuleEvaluationResult = {
  evaluated: number;
  actionsTaken: number;
  errors: number;
};

export async function evaluateRulesForUser(
  userId: string,
): Promise<RuleEvaluationResult> {
  const rules = await prisma.automationRule.findMany({
    where: { userId, enabled: true },
  });
  if (rules.length === 0) {
    return { evaluated: 0, actionsTaken: 0, errors: 0 };
  }

  const maxWindow = Math.max(
    ...rules.map((r) => r.windowDays ?? 3),
    7,
  );
  const since = new Date();
  since.setDate(since.getDate() - maxWindow);

  const campaigns = await prisma.campaign.findMany({
    where: { adAccount: { userId } },
    include: {
      adAccount: true,
      metrics: {
        where: { date: { gte: since } },
        orderBy: { date: "desc" },
      },
    },
  });

  let actionsTaken = 0;
  let errors = 0;

  for (const campaign of campaigns) {
    for (const rule of rules) {
      try {
        const acted = await applyRule(rule, campaign);
        if (acted) actionsTaken += 1;
      } catch (err) {
        errors += 1;
        await prisma.automationLog.create({
          data: {
            userId,
            ruleId: rule.id,
            campaignId: campaign.id,
            action: LogAction.RULE_EVALUATED,
            status: LogStatus.FAILED,
            message: `Échec de la règle ${rule.type} sur la campagne ${campaign.name}`,
            metadata: toJsonField({ error: String(err) }),
          },
        });
      }
    }
  }

  return {
    evaluated: campaigns.length * rules.length,
    actionsTaken,
    errors,
  };
}

async function applyRule(
  rule: AutomationRule,
  campaign: CampaignWithContext,
): Promise<boolean> {
  // Ignore les campagnes sur lesquelles on ne peut rien faire
  if (
    campaign.status === CampaignStatus.ARCHIVED ||
    campaign.adAccount.userId !== rule.userId
  ) {
    return false;
  }

  const ruleType = rule.type as RuleType;
  const defaults = RULE_DEFAULTS[ruleType];
  if (!defaults) return false; // type de règle inconnu stocké en base
  const threshold = rule.threshold ?? defaults.threshold;
  const windowDays = rule.windowDays ?? defaults.windowDays;
  const params = fromJsonField<Record<string, unknown>>(rule.params) ?? defaults.params;

  switch (ruleType) {
    case RuleType.PAUSE_LOW_ROAS:
      return pauseLowRoas(rule, campaign, threshold, windowDays);

    case RuleType.INCREASE_BUDGET_HIGH_ROAS: {
      const pct = Number(params.increasePct ?? 20);
      return increaseBudgetHighRoas(rule, campaign, threshold, pct);
    }

    case RuleType.FLAG_LOW_CTR:
      return flagLowCtr(rule, campaign, threshold, windowDays);

    case RuleType.ALERT_NO_CONVERSION:
      return alertNoConversion(rule, campaign, threshold, windowDays);

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Implémentation de chaque règle
// ---------------------------------------------------------------------------

async function pauseLowRoas(
  rule: AutomationRule,
  campaign: CampaignWithContext,
  threshold: number,
  windowDays: number,
): Promise<boolean> {
  if (campaign.status !== CampaignStatus.ACTIVE) return false;

  const recent = lastNDays(campaign.metrics, windowDays);
  if (recent.length < windowDays) return false; // pas assez de données

  const allLow = recent.every((m) => {
    if (m.spend <= 0) return false;
    const roas = m.spend > 0 ? m.revenue / m.spend : 0;
    return roas < threshold;
  });
  if (!allLow) return false;

  await pauseCampaignOnPlatform(campaign);
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.PAUSED },
  });
  await prisma.automationLog.create({
    data: {
      userId: rule.userId,
      ruleId: rule.id,
      campaignId: campaign.id,
      action: LogAction.CAMPAIGN_PAUSED,
      status: LogStatus.SUCCESS,
      message: `Mise en pause de « ${campaign.name} » — ROAS < ${threshold} pendant ${windowDays} jours`,
      metadata: toJsonField({ threshold, windowDays, recentRoas: recent.map(roasOf) }),
    },
  });
  return true;
}

async function increaseBudgetHighRoas(
  rule: AutomationRule,
  campaign: CampaignWithContext,
  threshold: number,
  increasePct: number,
): Promise<boolean> {
  if (campaign.status !== CampaignStatus.ACTIVE) return false;
  if (!campaign.dailyBudget) return false;
  if (!campaign.roas || campaign.roas <= threshold) return false;

  // Ne pas agir plus d'une fois toutes les 24 h sur la même campagne
  const recentlyActed = await prisma.automationLog.findFirst({
    where: {
      ruleId: rule.id,
      campaignId: campaign.id,
      action: LogAction.BUDGET_INCREASED,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (recentlyActed) return false;

  const newBudget = Math.round(campaign.dailyBudget * (1 + increasePct / 100));
  await updateBudgetOnPlatform(campaign, newBudget);
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { dailyBudget: newBudget },
  });
  await prisma.automationLog.create({
    data: {
      userId: rule.userId,
      ruleId: rule.id,
      campaignId: campaign.id,
      action: LogAction.BUDGET_INCREASED,
      status: LogStatus.SUCCESS,
      message: `Budget de « ${campaign.name} » augmenté de ${campaign.dailyBudget} € à ${newBudget} € (ROAS ${campaign.roas.toFixed(2)})`,
      metadata: toJsonField({
        previousBudget: campaign.dailyBudget,
        newBudget,
        roas: campaign.roas,
        increasePct,
      }),
    },
  });
  return true;
}

async function flagLowCtr(
  rule: AutomationRule,
  campaign: CampaignWithContext,
  thresholdPct: number,
  windowDays: number,
): Promise<boolean> {
  const recent = lastNDays(campaign.metrics, windowDays);
  if (recent.length === 0) return false;

  const totals = recent.reduce(
    (acc, m) => ({
      impressions: acc.impressions + m.impressions,
      clicks: acc.clicks + m.clicks,
    }),
    { impressions: 0, clicks: 0 },
  );
  if (totals.impressions < 1000) return false; // ignorer les échantillons trop petits (bruit)

  const ctr = (totals.clicks / totals.impressions) * 100;
  if (ctr >= thresholdPct) {
    if (campaign.flagged && campaign.flagReason?.startsWith("CTR faible")) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { flagged: false, flagReason: null },
      });
    }
    return false;
  }

  if (campaign.flagged) return false;

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      flagged: true,
      flagReason: `CTR faible (${ctr.toFixed(2)} % < ${thresholdPct} %)`,
    },
  });
  await prisma.automationLog.create({
    data: {
      userId: rule.userId,
      ruleId: rule.id,
      campaignId: campaign.id,
      action: LogAction.CAMPAIGN_FLAGGED,
      status: LogStatus.SUCCESS,
      message: `« ${campaign.name} » signalée — CTR ${ctr.toFixed(2)} % sous ${thresholdPct} %`,
      metadata: toJsonField({ ctr, thresholdPct, windowDays }),
    },
  });
  return true;
}

async function alertNoConversion(
  rule: AutomationRule,
  campaign: CampaignWithContext,
  spendThreshold: number,
  windowDays: number,
): Promise<boolean> {
  const recent = lastNDays(campaign.metrics, windowDays);
  if (recent.length === 0) return false;

  const totals = recent.reduce(
    (acc, m) => ({
      spend: acc.spend + m.spend,
      conversions: acc.conversions + m.conversions,
    }),
    { spend: 0, conversions: 0 },
  );

  if (totals.spend < spendThreshold || totals.conversions > 0) return false;

  // Évite de spammer : on ignore s'il existe déjà une alerte dans la fenêtre
  const recentAlert = await prisma.automationLog.findFirst({
    where: {
      ruleId: rule.id,
      campaignId: campaign.id,
      action: LogAction.ALERT_GENERATED,
      createdAt: {
        gte: new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000),
      },
    },
  });
  if (recentAlert) return false;

  await prisma.automationLog.create({
    data: {
      userId: rule.userId,
      ruleId: rule.id,
      campaignId: campaign.id,
      action: LogAction.ALERT_GENERATED,
      status: LogStatus.SUCCESS,
      message: `Alerte : « ${campaign.name} » a dépensé ${totals.spend.toFixed(0)} € en ${windowDays} j sans conversion`,
      metadata: toJsonField({ spend: totals.spend, conversions: 0, windowDays }),
    },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Effets de bord côté plateformes (Meta / Google)
// ---------------------------------------------------------------------------

async function pauseCampaignOnPlatform(campaign: CampaignWithContext) {
  const account = campaign.adAccount;
  if (account.platform === Platform.META) {
    await pauseMetaCampaign(account.accessToken, campaign.externalId);
  } else if (account.platform === Platform.GOOGLE) {
    await pauseGoogleCampaign(account.accessToken, campaign.externalId);
  }
}

async function updateBudgetOnPlatform(
  campaign: CampaignWithContext,
  newBudget: number,
) {
  const account = campaign.adAccount;
  if (account.platform === Platform.META) {
    await updateMetaBudget(account.accessToken, campaign.externalId, newBudget);
  } else if (account.platform === Platform.GOOGLE) {
    await updateGoogleBudget(account.accessToken, campaign.externalId, newBudget);
  }
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function lastNDays(metrics: CampaignMetric[], n: number): CampaignMetric[] {
  // les métriques sont déjà triées par date décroissante
  return metrics.slice(0, n);
}

function roasOf(m: CampaignMetric): number {
  return m.spend > 0 ? +(m.revenue / m.spend).toFixed(2) : 0;
}
