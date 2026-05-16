"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuleType } from "@/lib/enums";

type RuleState = {
  id: string;
  enabled: boolean;
  threshold: number | null;
  windowDays: number | null;
  params: Record<string, unknown>;
};

export function RuleToggle({
  type,
  label,
  description,
  rule,
  defaults,
}: {
  type: RuleType;
  label: string;
  description: string;
  rule: RuleState | null;
  defaults: { threshold: number; windowDays: number; params: Record<string, unknown> };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const [threshold, setThreshold] = useState<number>(
    rule?.threshold ?? defaults.threshold,
  );
  const [windowDays, setWindowDays] = useState<number>(
    rule?.windowDays ?? defaults.windowDays,
  );
  const [increasePct, setIncreasePct] = useState<number>(
    Number(
      rule?.params.increasePct ??
        (defaults.params as { increasePct?: number }).increasePct ??
        20,
    ),
  );

  function save(next: { enabled?: boolean; threshold?: number; windowDays?: number; increasePct?: number }) {
    const payload = {
      type,
      enabled: next.enabled ?? enabled,
      threshold: next.threshold ?? threshold,
      windowDays: next.windowDays ?? windowDays,
      params:
        type === "INCREASE_BUDGET_HIGH_ROAS"
          ? { increasePct: next.increasePct ?? increasePct }
          : {},
    };
    startTransition(async () => {
      await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    });
  }

  const thresholdMeta = thresholdConfig(type);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{label}</h3>
            {isPending && (
              <span className="text-xs text-muted-foreground">enregistrement...</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onChange={(val) => {
            setEnabled(val);
            save({ enabled: val });
          }}
        />
      </div>

      {enabled && (
        <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-3">
          <div>
            <label className="label">{thresholdMeta.label}</label>
            <input
              type="number"
              step={thresholdMeta.step}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onBlur={() => save({ threshold })}
              className="input"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {thresholdMeta.hint}
            </p>
          </div>
          {type !== "INCREASE_BUDGET_HIGH_ROAS" && (
            <div>
              <label className="label">Fenêtre (jours)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={windowDays}
                onChange={(e) => setWindowDays(Number(e.target.value))}
                onBlur={() => save({ windowDays })}
                className="input"
              />
            </div>
          )}
          {type === "INCREASE_BUDGET_HIGH_ROAS" && (
            <div>
              <label className="label">Augmentation du budget (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={increasePct}
                onChange={(e) => setIncreasePct(Number(e.target.value))}
                onBlur={() => save({ increasePct })}
                className="input"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function thresholdConfig(type: RuleType) {
  switch (type) {
    case "PAUSE_LOW_ROAS":
      return {
        label: "Seuil de ROAS",
        hint: "Mettre en pause si en-dessous de cette valeur",
        step: 0.1,
      };
    case "INCREASE_BUDGET_HIGH_ROAS":
      return {
        label: "Seuil de ROAS",
        hint: "Scaler si au-dessus de cette valeur",
        step: 0.1,
      };
    case "FLAG_LOW_CTR":
      return {
        label: "Seuil de CTR (%)",
        hint: "Signaler si en-dessous de cette valeur",
        step: 0.1,
      };
    case "ALERT_NO_CONVERSION":
      return {
        label: "Seuil de dépense (€)",
        hint: "Alerter si dépense supérieure et 0 conversion",
        step: 1,
      };
  }
}
