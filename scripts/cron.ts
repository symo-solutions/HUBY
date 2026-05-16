/**
 * Worker cron autonome pour les déploiements auto-hébergés (par ex. une VM).
 *
 * Pour les déploiements Vercel, utiliser plutôt vercel.json.
 *
 *   npm run cron:start
 */
import cron from "node-cron";
import { syncAllUsers } from "../lib/sync";

const SCHEDULE = process.env.CRON_SCHEDULE ?? "0 */6 * * *"; // toutes les 6 h

console.log(`[cron] démarrage avec la planification "${SCHEDULE}"`);

cron.schedule(SCHEDULE, async () => {
  console.log(
    `[cron] déclenchement ${new Date().toISOString()} — synchronisation de tous les utilisateurs...`,
  );
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
    console.log(`[cron] terminé`, summary);
  } catch (err) {
    console.error(`[cron] échec`, err);
  }
});
