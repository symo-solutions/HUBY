# Smart Ads Controller

> SaaS MVP de pilotage automatisé de campagnes **Meta Ads** et **Google Ads**, avec moteur de règles d'optimisation et **assistant IA conversationnel** intégré.

Smart Ads Controller permet à un annonceur de connecter ses comptes publicitaires, de visualiser ses KPIs (dépense, ROAS, CTR, conversions) et de laisser une IA gérer les campagnes en langage naturel — tout en appliquant automatiquement des règles d'optimisation (mise en pause des campagnes peu rentables, montée en budget des gagnantes, signalement des CTR faibles, alertes de dépense sans conversion).

L'application est **100 % en français** : interface, messages d'erreur, journaux d'automatisation et conversation avec l'agent IA.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Pile technique](#pile-technique)
- [Architecture](#architecture)
- [Installation locale](#installation-locale)
- [Variables d'environnement](#variables-denvironnement)
- [Compte de démonstration](#compte-de-démonstration)
- [Mode mocks (sans clé API)](#mode-mocks-sans-clé-api)
- [Assistant IA](#assistant-ia)
- [Moteur de règles](#moteur-de-règles)
- [Synchronisation et cron](#synchronisation-et-cron)
- [Modèle de données](#modèle-de-données)
- [Scripts utiles](#scripts-utiles)
- [Déploiement (Vercel)](#déploiement-vercel)
- [Migration vers PostgreSQL](#migration-vers-postgresql)
- [Sécurité](#sécurité)
- [Feuille de route](#feuille-de-route)
- [Licence](#licence)

---

## Fonctionnalités

- **Authentification** par e-mail et mot de passe (NextAuth, sessions JWT, bcrypt).
- **Connexion OAuth** des comptes Meta Ads et Google Ads.
- **Tableau de bord** global : KPIs agrégés, top campagnes, statut des comptes connectés.
- **Liste des campagnes** avec filtre par plateforme, badges de statut et signalements.
- **Synchronisation** des campagnes et métriques via les API Meta Marketing et Google Ads (avec mocks intégrés).
- **Moteur de règles d'automatisation** :
  - Mise en pause automatique des campagnes à ROAS faible.
  - Augmentation automatique du budget des campagnes à ROAS élevé.
  - Signalement des campagnes à CTR faible.
  - Alerte sur dépense sans conversion.
- **Journaux d'actions** : historique horodaté de toutes les décisions automatiques.
- **Assistant IA conversationnel** (bulle en bas à droite) : créer, lister, mettre en pause, reprendre, modifier le budget ou supprimer une campagne en langage naturel.
- **Mode mocks** : l'application est entièrement utilisable sans aucune clé API, avec des données simulées déterministes.

---

## Pile technique

| Couche | Technologie |
|---|---|
| Front + back | **Next.js 14** (App Router, Server Components, Route Handlers) |
| Langage | **TypeScript** |
| UI | **TailwindCSS** + **lucide-react** |
| ORM | **Prisma 5** |
| Base de données | **SQLite** (développement) — portable vers **PostgreSQL** en production |
| Authentification | **NextAuth.js** (Credentials Provider, JWT, bcrypt) |
| Validation | **Zod** |
| Cron | **node-cron** (auto-hébergé) ou **Vercel Cron** |
| LLM | **OpenAI** (Chat Completions + function calling) — *fallback déterministe si aucune clé* |

---

## Architecture

```
smart-ads-controller/
├── app/
│   ├── (app)/                  # Pages authentifiées (layout privé)
│   │   ├── dashboard/          # Vue d'ensemble + bouton Synchroniser
│   │   ├── campaigns/          # Liste filtrable des campagnes
│   │   ├── integrations/       # Connexion OAuth Meta/Google + règles
│   │   └── logs/               # Journal des actions automatiques
│   ├── api/
│   │   ├── auth/               # NextAuth + inscription
│   │   ├── agent/chat/         # Endpoint de l'assistant IA
│   │   ├── campaigns/          # Création/suppression manuelle
│   │   ├── cron/sync/          # Synchronisation périodique (protégée)
│   │   ├── integrations/       # Callbacks OAuth Meta/Google
│   │   ├── rules/              # Activation/seuils des règles
│   │   └── sync/               # Synchronisation manuelle
│   ├── login/                  # Connexion
│   ├── register/               # Inscription
│   └── page.tsx                # Page d'accueil publique
├── components/
│   ├── agent-chat.tsx          # Bulle + panneau de chat (assistant IA)
│   ├── sidebar.tsx             # Navigation latérale
│   └── ...                     # KPI cards, badges, etc.
├── lib/
│   ├── agent.ts                # Orchestrateur de l'agent (LLM ou mock)
│   ├── agent-tools.ts          # Outils que l'agent peut appeler
│   ├── llm.ts                  # Client OpenAI minimal
│   ├── rules-engine.ts         # Moteur de règles d'automatisation
│   ├── sync.ts                 # Orchestration de la synchronisation
│   ├── meta-api.ts             # Client Meta Marketing API (+ mocks)
│   ├── google-ads-api.ts       # Client Google Ads API (+ mocks)
│   ├── auth.ts                 # Configuration NextAuth
│   ├── session.ts              # Helpers de session côté serveur
│   ├── db.ts                   # Client Prisma (singleton)
│   ├── enums.ts                # Énumérations applicatives (portables SQLite/PG)
│   ├── json-field.ts           # Helpers de (dé)sérialisation JSON
│   └── utils.ts                # Formatage (€, dates relatives FR, etc.)
├── prisma/
│   ├── schema.prisma           # Modèles de données
│   └── seed.ts                 # Compte de démonstration
├── scripts/
│   └── cron.ts                 # Worker cron auto-hébergé
├── middleware.ts               # Protection des routes privées
└── vercel.json                 # Configuration cron Vercel
```

---

## Installation locale

### Prérequis

- **Node.js** 18 ou supérieur
- **npm** (ou pnpm/yarn)

### Étapes

```bash
git clone https://github.com/symo-solutions/HUBY.git
cd HUBY
npm install
cp .env.example .env
npx prisma db push
npm run db:seed
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000).

> Sur Windows, si la commande `cp` n'existe pas, utilisez `copy .env.example .env` (cmd) ou `Copy-Item .env.example .env` (PowerShell).

---

## Variables d'environnement

Toutes les variables sont documentées dans `.env.example`. Les principales :

| Variable | Rôle | Obligatoire ? |
|---|---|---|
| `DATABASE_URL` | URL Prisma (par défaut `file:./dev.db` pour SQLite) | Oui |
| `NEXTAUTH_URL` | URL publique de l'application | Oui |
| `NEXTAUTH_SECRET` | Secret de signature JWT (chaîne aléatoire longue) | Oui |
| `META_APP_ID` / `META_APP_SECRET` / `META_REDIRECT_URI` | OAuth Meta Ads | Non (mocks sinon) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth Google Ads | Non (mocks sinon) |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Token développeur Google Ads | Non |
| `CRON_SECRET` | Protège l'endpoint `/api/cron/sync` | Recommandé en prod |
| `USE_MOCKS` | `"true"` pour forcer les données simulées | Non |
| `OPENAI_API_KEY` | Active l'agent IA réel (sinon fallback déterministe) | Non |
| `OPENAI_MODEL` | Modèle utilisé (par défaut `gpt-4o-mini`) | Non |

---

## Compte de démonstration

Après `npm run db:seed`, un utilisateur est créé avec :

- **Email** : `demo@smart-ads.dev`
- **Mot de passe** : `demo12345`

Deux comptes publicitaires (Meta + Google) sont préconnectés en mode mocks. Les quatre règles d'automatisation sont provisionnées (désactivées par défaut). Cliquez sur **Synchroniser** depuis le tableau de bord pour peupler les campagnes et les métriques.

---

## Mode mocks (sans clé API)

L'application est conçue pour fonctionner **end-to-end sans aucune clé** :

- Les clients Meta et Google Ads renvoient des données simulées déterministes (3 campagnes par plateforme, métriques pseudo-aléatoires reproductibles).
- L'agent IA bascule sur un **parseur d'intention déterministe** qui comprend les phrases simples en français (« crée une campagne perdante », « mets en pause Black Friday », « augmente le budget de X de 20 % », « fais-moi un résumé »).
- Le moteur de règles, la synchronisation et le journal fonctionnent normalement.

Pour activer les vraies API, renseignez les identifiants OAuth correspondants dans `.env` et passez `USE_MOCKS="false"`.

---

## Assistant IA

L'assistant est accessible via la **bulle ronde en bas à droite** sur toutes les pages authentifiées. Il dispose de huit outils côté serveur :

| Outil | Action |
|---|---|
| `create_campaign` | Crée une campagne (avec preset `winner`/`loser`/`lowctr`/`noconv`) |
| `list_campaigns` | Liste les campagnes (filtre par plateforme/statut) |
| `pause_campaign` | Met une campagne en pause |
| `resume_campaign` | Réactive une campagne |
| `update_budget` | Modifie le budget journalier (montant absolu ou delta %) |
| `delete_campaign` | Supprime une campagne (DB locale uniquement) |
| `evaluate_rules` | Déclenche le moteur de règles |
| `get_summary` | Renvoie un résumé KPI |

**Mode OpenAI** : si `OPENAI_API_KEY` est défini, l'agent utilise le *function calling* de l'API Chat Completions et peut chaîner plusieurs outils en un tour.

**Mode démo** : sinon, le parseur déterministe reconnaît les intentions courantes en français et appelle directement les bons outils. Pratique pour tester sans dépenser de jetons.

Toutes les actions de l'agent sont autorisées par `userId` côté serveur, donc un utilisateur ne peut jamais agir sur les campagnes d'un autre.

---

## Moteur de règles

Quatre règles sont disponibles, chacune avec un seuil et une fenêtre temporelle configurables depuis `/integrations` :

| Règle | Effet par défaut |
|---|---|
| **PAUSE_LOW_ROAS** | Si ROAS < 1,0 pendant 3 jours consécutifs → campagne mise en pause |
| **INCREASE_BUDGET_HIGH_ROAS** | Si ROAS > 2,0 → budget journalier augmenté de 20 % (max 1×/24 h) |
| **FLAG_LOW_CTR** | Si CTR < 0,5 % sur 3 jours (≥ 1000 impressions) → campagne signalée |
| **ALERT_NO_CONVERSION** | Si dépense > 50 € sur 7 jours sans conversion → alerte enregistrée |

Le moteur s'exécute :
- À chaque synchronisation (manuelle ou cron).
- À la demande via l'agent IA (« évalue les règles »).
- Automatiquement après création d'une campagne par l'agent.

Chaque action génère une ligne dans `AutomationLog` consultable depuis `/logs`.

---

## Synchronisation et cron

Endpoint `GET/POST /api/cron/sync` — protégé par `CRON_SECRET` :

- **Vercel** : `vercel.json` contient déjà la planification (toutes les 6 h). Configurez `CRON_SECRET` dans les variables d'env Vercel.
- **Auto-hébergé** : `npm run cron:start` lance `scripts/cron.ts` qui appelle `syncAllUsers()` toutes les 6 h.

Pour chaque compte connecté, la sync :
1. Récupère les campagnes et insights (Meta ou Google).
2. *Upsert* dans `Campaign` + écrit 7 jours de `CampaignMetric`.
3. Met à jour `lastSyncedAt`.
4. Exécute le moteur de règles.

---

## Modèle de données

Six modèles principaux dans `prisma/schema.prisma` :

- **`User`** — compte applicatif (e-mail, hash bcrypt).
- **`AdAccount`** — un compte publicitaire connecté (Meta ou Google), tokens OAuth.
- **`Campaign`** — une campagne, avec métriques agrégées 30 j en cache.
- **`CampaignMetric`** — métriques journalières par campagne (fenêtre 7 j).
- **`AutomationRule`** — règle activable par utilisateur, seuil + fenêtre + paramètres.
- **`AutomationLog`** — historique des actions du moteur de règles + agent.

Les énumérations sont stockées en `String` (validées au runtime via `lib/enums.ts`) pour rester portables entre SQLite et PostgreSQL.

---

## Scripts utiles

```bash
npm run dev              # Serveur de développement
npm run build            # Build de production (inclut prisma generate)
npm run start            # Lancement du build de production
npm run db:push          # Applique le schéma Prisma à la DB
npm run db:migrate       # Crée et applique une migration
npm run db:studio        # Ouvre Prisma Studio
npm run db:seed          # Crée le compte de démonstration
npm run cron:start       # Démarre le worker cron auto-hébergé
```

---

## Déploiement (Vercel)

1. Importez le repo GitHub sur [vercel.com/new](https://vercel.com/new).
2. Vercel détecte automatiquement Next.js — aucune configuration de build à modifier.
3. Renseignez les variables d'environnement (au minimum `DATABASE_URL` Postgres, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `CRON_SECRET`).
4. Si vous utilisez les vraies API, ajoutez les identifiants Meta et Google (et passez `USE_MOCKS="false"`).
5. La planification cron est lue depuis `vercel.json`.

---

## Migration vers PostgreSQL

SQLite est utilisé par défaut pour zéro friction en local. Pour passer en production sur Postgres :

1. Modifiez `prisma/schema.prisma` :
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. Mettez à jour `DATABASE_URL` (par exemple Vercel Postgres, Neon, Supabase).
3. Lancez `npx prisma migrate deploy` (ou `db push` pour un premier déploiement).

Aucune modification du code applicatif n'est nécessaire : les énumérations sont déjà stockées en `String` et les champs JSON déjà sérialisés via `lib/json-field.ts`.

---

## Sécurité

- Mots de passe hachés via **bcrypt** (10 rounds).
- Sessions **NextAuth JWT** signées par `NEXTAUTH_SECRET`.
- Chaque requête Prisma est scopée par `userId` (autorisation côté serveur, jamais déléguée au client).
- Les tokens OAuth sont stockés tels quels dans la DB pour le MVP — **à chiffrer au repos en production** (par exemple via une rotation `KMS` + un helper `lib/crypto.ts`).
- L'endpoint cron est protégé par `CRON_SECRET` (querystring `?secret=...` ou en-tête `Authorization: Bearer ...`).
- Le `state` OAuth est vérifié côté callback (sauf en mode mocks).

---

## Feuille de route

Idées d'évolution post-MVP :

- Chiffrement des tokens OAuth au repos.
- Ventilation jour par jour des métriques (au lieu de la synthèse depuis l'agrégat 30 j).
- Règles personnalisées définies par l'utilisateur (pas seulement les 4 prédéfinies).
- Multi-utilisateur / équipes / rôles.
- Webhooks et notifications (Slack, e-mail).
- Mémorisation conversationnelle de l'agent (historique persistant en DB).
- Tests automatisés (unit + e2e Playwright).
- Tableaux et graphiques avancés (recharts / visx).

---

## Licence

Code propriétaire — © Symo Solutions.

Pour toute question : [github.com/symo-solutions](https://github.com/symo-solutions).
