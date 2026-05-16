import { NextResponse } from "next/server";
import { syncAllUsers } from "@/lib/sync";

/**
 * Periodic sync endpoint - protected by CRON_SECRET.
 *
 * - Vercel cron: configure in vercel.json with `?secret=...` or
 *   `Authorization: Bearer ...`.
 * - node-cron: see scripts/cron.ts (calls this endpoint every 6 hours).
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const started = Date.now();
  const results = await syncAllUsers();
  const totals = results.reduce(
    (acc, r) => ({
      accountsSynced: acc.accountsSynced + r.accountsSynced,
      campaignsUpserted: acc.campaignsUpserted + r.campaignsUpserted,
      rulesActions: acc.rulesActions + r.rulesActions,
      rulesErrors: acc.rulesErrors + r.rulesErrors,
    }),
    { accountsSynced: 0, campaignsUpserted: 0, rulesActions: 0, rulesErrors: 0 },
  );

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    users: results.length,
    ...totals,
  });
}

export const POST = GET;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured - reject in production, allow in dev for convenience
    return process.env.NODE_ENV !== "production";
  }
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return false;
}
