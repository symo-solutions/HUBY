/**
 * Standalone cron worker for self-hosted setups (e.g. a small VM).
 *
 * For Vercel deployments, use vercel.json instead.
 *
 *   npm run cron:start
 */
import cron from "node-cron";
import { syncAllUsers } from "../lib/sync";

const SCHEDULE = process.env.CRON_SCHEDULE ?? "0 */6 * * *"; // every 6h

console.log(`[cron] starting with schedule "${SCHEDULE}"`);

cron.schedule(SCHEDULE, async () => {
  console.log(`[cron] tick ${new Date().toISOString()} - syncing all users...`);
  try {
    const results = await syncAllUsers();
    const summary = results.reduce(
      (acc, r) => ({
        users: acc.users + 1,
        accountsSynced: acc.accountsSynced + r.accountsSynced,
        campaignsUpserted: acc.campaignsUpserted + r.campaignsUpserted,
        rulesActions: acc.rulesActions + r.rulesActions,
      }),
      { users: 0, accountsSynced: 0, campaignsUpserted: 0, rulesActions: 0 },
    );
    console.log(`[cron] done`, summary);
  } catch (err) {
    console.error(`[cron] failed`, err);
  }
});
