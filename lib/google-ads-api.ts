/**
 * Client de l'API Google Ads (wrapper léger).
 *
 * En production, on utiliserait la bibliothèque officielle `google-ads-api`
 * avec des requêtes GAQL. Pour le MVP, on implémente une surface réduite
 * et on bascule sur des mocks si les identifiants manquent, afin que tout
 * le pipeline tourne en local.
 *
 * Docs : https://developers.google.com/google-ads/api/docs/start
 */

import { CampaignStatus } from "@/lib/enums";

export type GoogleCampaign = {
  externalId: string;
  name: string;
  status: CampaignStatus;
  dailyBudget: number | null;
  objective: string | null;
};

export type GoogleInsights = {
  externalId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
};

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
};

const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

function shouldUseMocks(): boolean {
  return (
    process.env.USE_MOCKS === "true" ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  );
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildGoogleAuthUrl(state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "mock-google-client");
  url.searchParams.set(
    "redirect_uri",
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/integrations/google/callback",
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/adwords openid email profile",
  );
  return url.toString();
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  if (shouldUseMocks()) {
    return {
      accessToken: `mock-google-token-${Date.now()}`,
      refreshToken: `mock-google-refresh-${Date.now()}`,
      expiresIn: 3600,
    };
  }

  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    grant_type: "authorization_code",
  });

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  if (shouldUseMocks()) {
    return { accessToken: `mock-google-token-${Date.now()}`, expiresIn: 3600 };
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

// ---------------------------------------------------------------------------
// Account / campaigns / insights
// ---------------------------------------------------------------------------

export async function fetchGoogleAdAccounts(_accessToken: string) {
  if (shouldUseMocks()) {
    return [
      { externalId: "customers/9876543210", name: "Mock Google Ads Account", currency: "EUR" },
    ];
  }
  // Implémentation réelle : googleads.customers.listAccessibleCustomers
  // Laissé en TODO — le MVP utilise des mocks tant que le developer token n'est pas défini.
  return [];
}

export async function fetchGoogleCampaigns(
  _accessToken: string,
  customerId: string,
): Promise<GoogleCampaign[]> {
  if (shouldUseMocks()) {
    return mockGoogleCampaigns(customerId);
  }
  // Implémentation réelle : GAQL `SELECT campaign.id, campaign.name,
  // campaign.status, campaign_budget.amount_micros FROM campaign`
  return [];
}

export async function fetchGoogleInsights(
  _accessToken: string,
  customerId: string,
): Promise<GoogleInsights[]> {
  if (shouldUseMocks()) {
    return mockGoogleCampaigns(customerId).map((c) => mockGoogleInsights(c.externalId));
  }
  // Implémentation réelle : GAQL `SELECT campaign.id, metrics.cost_micros,
  // metrics.impressions, metrics.clicks, metrics.conversions,
  // metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_30_DAYS`
  return [];
}

export async function pauseGoogleCampaign(
  _accessToken: string,
  externalId: string,
): Promise<void> {
  if (shouldUseMocks()) return;
  // Implémentation réelle : googleads.campaigns.mutate avec status PAUSED
  console.log(`[google-ads] pause ${externalId}`);
}

export async function updateGoogleBudget(
  _accessToken: string,
  externalId: string,
  newDailyBudget: number,
): Promise<void> {
  if (shouldUseMocks()) return;
  console.log(`[google-ads] budget ${externalId} -> ${newDailyBudget}`);
}

// ---------------------------------------------------------------------------
// Données simulées
// ---------------------------------------------------------------------------

function mockGoogleCampaigns(customer: string): GoogleCampaign[] {
  return [
    {
      externalId: `${customer}/campaigns/777001`,
      name: "Google - Search Brand",
      status: CampaignStatus.ACTIVE,
      dailyBudget: 25,
      objective: "SEARCH",
    },
    {
      externalId: `${customer}/campaigns/777002`,
      name: "Google - Performance Max",
      status: CampaignStatus.ACTIVE,
      dailyBudget: 120,
      objective: "PERFORMANCE_MAX",
    },
    {
      externalId: `${customer}/campaigns/777003`,
      name: "Google - YouTube Awareness",
      status: CampaignStatus.PAUSED,
      dailyBudget: 40,
      objective: "VIDEO",
    },
  ];
}

function mockGoogleInsights(externalId: string): GoogleInsights {
  const hash = [...externalId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = (min: number, max: number) =>
    min + ((hash * 1664525 + 1013904223) % 4294967296) / 4294967296 * (max - min);

  const spend = Math.round(rand(50, 1500));
  const impressions = Math.round(rand(5000, 200000));
  const clicks = Math.round(impressions * rand(0.005, 0.06));
  const conversions = Math.round(clicks * rand(0.005, 0.12));
  const revenue = Math.round(conversions * rand(20, 120));

  return { externalId, spend, impressions, clicks, conversions, revenue };
}
