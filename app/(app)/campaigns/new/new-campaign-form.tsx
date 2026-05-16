"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

type AccountOption = {
  id: string;
  name: string;
  platform: string;
  currency: string | null;
};

type Preset = {
  id: string;
  label: string;
  description: string;
  patch: Partial<FormState>;
};

type FormState = {
  adAccountId: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "UNKNOWN";
  dailyBudget: string;
  objective: string;
  spend: string;
  impressions: string;
  clicks: string;
  conversions: string;
  revenue: string;
  evaluateRules: boolean;
};

const PRESETS: Preset[] = [
  {
    id: "winner",
    label: "Gagnante à scaler (ROAS élevé)",
    description: "ROAS ~3,0 → déclenche INCREASE_BUDGET_HIGH_ROAS",
    patch: {
      name: "Démo — Prospection ROAS élevé",
      objective: "CONVERSIONS",
      dailyBudget: "60",
      spend: "1200",
      impressions: "120000",
      clicks: "3600",
      conversions: "180",
      revenue: "3600",
      status: "ACTIVE",
    },
  },
  {
    id: "loser",
    label: "Perdante (ROAS faible, 3j)",
    description: "ROAS ~0,4 → déclenche PAUSE_LOW_ROAS",
    patch: {
      name: "Démo — Retargeting ROAS faible",
      objective: "CONVERSIONS",
      dailyBudget: "40",
      spend: "900",
      impressions: "60000",
      clicks: "1500",
      conversions: "20",
      revenue: "360",
      status: "ACTIVE",
    },
  },
  {
    id: "lowctr",
    label: "CTR faible",
    description: "CTR ~0,2 % → déclenche FLAG_LOW_CTR",
    patch: {
      name: "Démo — Notoriété audience large",
      objective: "REACH",
      dailyBudget: "30",
      spend: "300",
      impressions: "200000",
      clicks: "400",
      conversions: "5",
      revenue: "100",
      status: "ACTIVE",
    },
  },
  {
    id: "noconv",
    label: "Dépense sans conversion",
    description: "Dépense > 50 €, 0 conv. → ALERT_NO_CONVERSION",
    patch: {
      name: "Démo — Test nouvelle créa",
      objective: "TRAFFIC",
      dailyBudget: "20",
      spend: "150",
      impressions: "20000",
      clicks: "300",
      conversions: "0",
      revenue: "0",
      status: "ACTIVE",
    },
  },
];

const initialState = (accounts: AccountOption[]): FormState => ({
  adAccountId: accounts[0]?.id ?? "",
  name: "",
  status: "ACTIVE",
  dailyBudget: "50",
  objective: "CONVERSIONS",
  spend: "",
  impressions: "",
  clicks: "",
  conversions: "",
  revenue: "",
  evaluateRules: true,
});

export function NewCampaignForm({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => initialState(accounts));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionsCount, setActionsCount] = useState<number | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === form.adAccountId) ?? accounts[0],
    [accounts, form.adAccountId],
  );

  const derived = useMemo(() => {
    const spend = Number(form.spend) || 0;
    const impressions = Number(form.impressions) || 0;
    const clicks = Number(form.clicks) || 0;
    const revenue = Number(form.revenue) || 0;
    const roas = spend > 0 ? revenue / spend : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    return { roas, ctr };
  }, [form.spend, form.impressions, form.clicks, form.revenue]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function applyPreset(preset: Preset) {
    setForm((f) => ({ ...f, ...preset.patch }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setActionsCount(null);
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adAccountId: form.adAccountId,
          name: form.name,
          status: form.status,
          dailyBudget: form.dailyBudget ? Number(form.dailyBudget) : null,
          objective: form.objective || null,
          spend: Number(form.spend) || 0,
          impressions: Number(form.impressions) || 0,
          clicks: Number(form.clicks) || 0,
          conversions: Number(form.conversions) || 0,
          revenue: Number(form.revenue) || 0,
          evaluateRules: form.evaluateRules,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        rulesActions?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Impossible de créer la campagne.");
        return;
      }
      setActionsCount(data.rulesActions ?? 0);
      router.push("/campaigns");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Préréglages rapides
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Pré-remplit le formulaire avec des valeurs qui déclenchent une règle
          précise.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition hover:border-primary"
            >
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {p.label}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.description}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">Nom de la campagne *</label>
          <input
            id="name"
            required
            className="input"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="ex. Black Friday — prospection LAL 1 %"
          />
        </div>

        <div>
          <label className="label" htmlFor="account">Compte publicitaire *</label>
          <select
            id="account"
            required
            className="input"
            value={form.adAccountId}
            onChange={(e) => update("adAccountId", e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.platform} · {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="status">Statut</label>
          <select
            id="status"
            className="input"
            value={form.status}
            onChange={(e) =>
              update("status", e.target.value as FormState["status"])
            }
          >
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">En pause</option>
            <option value="ARCHIVED">Archivée</option>
          </select>
        </div>

        <div>
          <label className="label" htmlFor="budget">
            Budget journalier ({selectedAccount?.currency ?? "EUR"})
          </label>
          <input
            id="budget"
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={form.dailyBudget}
            onChange={(e) => update("dailyBudget", e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="objective">Objectif</label>
          <input
            id="objective"
            className="input"
            value={form.objective}
            onChange={(e) => update("objective", e.target.value)}
            placeholder="CONVERSIONS, REACH, TRAFFIC..."
          />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Métriques agrégées (30 derniers jours)
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Optionnel. À partir de ces valeurs, 7 jours de métriques journalières
          seront synthétisés pour que les règles fenêtrées (3j, 7j) puissent
          s&apos;évaluer.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumField
            id="spend"
            label="Dépense"
            value={form.spend}
            onChange={(v) => update("spend", v)}
          />
          <NumField
            id="impressions"
            label="Impressions"
            value={form.impressions}
            onChange={(v) => update("impressions", v)}
            integer
          />
          <NumField
            id="clicks"
            label="Clics"
            value={form.clicks}
            onChange={(v) => update("clicks", v)}
            integer
          />
          <NumField
            id="conversions"
            label="Conversions"
            value={form.conversions}
            onChange={(v) => update("conversions", v)}
            integer
          />
          <NumField
            id="revenue"
            label="Revenu"
            value={form.revenue}
            onChange={(v) => update("revenue", v)}
          />
          <div className="flex items-end">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
              <div>
                ROAS :{" "}
                <span className="font-mono text-foreground">
                  {derived.roas.toFixed(2)}
                </span>
              </div>
              <div>
                CTR :{" "}
                <span className="font-mono text-foreground">
                  {derived.ctr.toFixed(2)} %
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.evaluateRules}
          onChange={(e) => update("evaluateRules", e.target.checked)}
        />
        Évaluer les règles d&apos;automatisation juste après la création
      </label>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {actionsCount !== null && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Créée. Le moteur de règles a effectué {actionsCount} action(s).
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push("/campaigns")}
          className="btn-ghost"
        >
          Annuler
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Création..." : "Créer la campagne"}
        </button>
      </div>
    </form>
  );
}

function NumField({
  id,
  label,
  value,
  onChange,
  integer = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  integer?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={integer ? "1" : "0.01"}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
