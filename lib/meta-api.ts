/**
 * Meta (Facebook) Marketing API client.
 *
 * In production we hit the Graph API. When no credentials are configured
 * (or USE_MOCKS=true), we return deterministic mock data so the rest of the
 * pipeline (sync -> rules -> dashboard) keeps working end-to-end.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api
 */

import { CampaignStatus } from "@/lib/enums";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaCampaign = {
  externalId: string;
  name: string;
  status: CampaignStatus;
  dailyBudget: number | null;
  objective: string | null;
};

export type MetaInsights = {
  externalId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

export type MetaTokenResponse = {
  accessToken: string;
  expiresIn: number;
};

function shouldUseMocks(): boolean {
  return (
    process.env.USE_MOCKS === "true" ||
    !process.env.META_APP_ID ||
    !process.env.META_APP_SECRET
  );
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildMetaAuthUrl(state: string): string {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", process.env.META_APP_ID ?? "mock-app-id");
  url.searchParams.set(
    "redirect_uri",
    process.env.META_REDIRECT_URI ?? "http://localhost:3000/api/integrations/meta/callback",
  );
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    "ads_read,ads_management,business_management,read_insights",
  );
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeMetaCode(code: string): Promise<MetaTokenResponse> {
  if (shouldUseMocks()) {
    return { accessToken: `mock-meta-token-${Date.now()}`, expiresIn: 60 * 60 * 24 * 60 };
  }

  const url = new URL(`${GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set("client_id", process.env.META_APP_ID!);
  url.searchParams.set("client_secret", process.env.META_APP_SECRET!);
  url.searchParams.set("redirect_uri", process.env.META_REDIRECT_URI!);
  url.searchParams.set("code", code);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta token exchange failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

// ---------------------------------------------------------------------------
// Account / campaigns / insights
// ---------------------------------------------------------------------------

export async function fetchMetaAdAccounts(accessToken: string) {
  if (shouldUseMocks()) {
    return [
      { externalId: "act_1000001", name: "Mock Meta Account", currency: "EUR" },
    ];
  }
  const res = await fetch(
    `${GRAPH_BASE}/me/adaccounts?fields=id,name,currency&access_token=${accessToken}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Meta /me/adaccounts failed: ${res.status}`);
  const json = (await res.json()) as {
    data: { id: string; name: string; currency: string }[];
  };
  return json.data.map((a) => ({
    externalId: a.id,
    name: a.name,
    currency: a.currency,
  }));
}

export async function fetchMetaCampaigns(
  accessToken: string,
  adAccountExternalId: string,
): Promise<MetaCampaign[]> {
  if (shouldUseMocks()) {
    return mockMetaCampaigns(adAccountExternalId);
  }

  const url = new URL(`${GRAPH_BASE}/${adAccountExternalId}/campaigns`);
  url.searchParams.set(
    "fields",
    "id,name,status,daily_budget,objective,effective_status",
  );
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta campaigns fetch failed: ${res.status}`);
  const json = (await res.json()) as {
    data: {
      id: string;
      name: string;
      status: string;
      daily_budget?: string;
      objective?: string;
    }[];
  };
  return json.data.map((c) => ({
    externalId: c.id,
    name: c.name,
    status: mapMetaStatus(c.status),
    // Meta returns budget in minor units (cents)
    dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    objective: c.objective ?? null,
  }));
}

export async function fetchMetaInsights(
  accessToken: string,
  adAccountExternalId: string,
): Promise<MetaInsights[]> {
  if (shouldUseMocks()) {
    return mockMetaCampaigns(adAccountExternalId).map((c) => mockInsights(c.externalId));
  }

  const url = new URL(`${GRAPH_BASE}/${adAccountExternalId}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("date_preset", "last_30d");
  url.searchParams.set(
    "fields",
    "campaign_id,spend,impressions,clicks,actions,action_values",
  );
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Meta insights fetch failed: ${res.status}`);
  const json = (await res.json()) as {
    data: Array<{
      campaign_id: string;
      spend: string;
      impressions: string;
      clicks: string;
      actions?: { action_type: string; value: string }[];
      action_values?: { action_type: string; value: string }[];
    }>;
  };

  return json.data.map((row) => {
    const conversions = Number(
      row.actions?.find((a) => a.action_type === "purchase")?.value ?? 0,
    );
    const revenue = Number(
      row.action_values?.find((a) => a.action_type === "purchase")?.value ?? 0,
    );
    return {
      externalId: row.campaign_id,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions,
      revenue,
    };
  });
}

export async function pauseMetaCampaign(
  accessToken: string,
  externalId: string,
): Promise<void> {
  if (shouldUseMocks()) return;
  const res = await fetch(`${GRAPH_BASE}/${externalId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "PAUSED", access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`Meta pause failed: ${res.status}`);
}

export async function updateMetaBudget(
  accessToken: string,
  externalId: string,
  newDailyBudget: number,
): Promise<void> {
  if (shouldUseMocks()) return;
  const res = await fetch(`${GRAPH_BASE}/${externalId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      daily_budget: Math.round(newDailyBudget * 100),
      access_token: accessToken,
    }),
  });
  if (!res.ok) throw new Error(`Meta budget update failed: ${res.status}`);
}

// ---------------------------------------------------------------------------
// Helpers + mocks
// ---------------------------------------------------------------------------

function mapMetaStatus(s: string): CampaignStatus {
  switch (s) {
    case "ACTIVE":
      return CampaignStatus.ACTIVE;
    case "PAUSED":
      return CampaignStatus.PAUSED;
    case "ARCHIVED":
    case "DELETED":
      return CampaignStatus.ARCHIVED;
    default:
      return CampaignStatus.UNKNOWN;
  }
}

function mockMetaCampaigns(account: string): MetaCampaign[] {
  const seed = account.length;
  return [
    {
      externalId: `${account}_camp_1`,
      name: "Meta - Black Friday Retargeting",
      status: CampaignStatus.ACTIVE,
      dailyBudget: 50,
      objective: "CONVERSIONS",
    },
    {
      externalId: `${account}_camp_2`,
      name: "Meta - Prospecting Lookalike 1%",
      status: CampaignStatus.ACTIVE,
      dailyBudget: 80,
      objective: "CONVERSIONS",
    },
    {
      externalId: `${account}_camp_3`,
      name: "Meta - Brand Awareness",
      status: seed % 2 === 0 ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED,
      dailyBudget: 30,
      objective: "REACH",
    },
  ];
}

function mockInsights(externalId: string): MetaInsights {
  // Deterministic pseudo-random based on id
  const hash = [...externalId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (min: number, max: number) =>
    min + ((hash * 9301 + 49297) % 233280) / 233280 * (max - min);

  const spend = Math.round(rand(20, 800));
  const impressions = Math.round(rand(2000, 90000));
  const clicks = Math.round(impressions * rand(0.002, 0.04));
  const conversions = Math.round(clicks * rand(0.01, 0.1));
  const revenue = Math.round(conversions * rand(15, 80));

  return {
    externalId,
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
  };
}
