import { Platform } from "@/lib/enums";
import { cn } from "@/lib/utils";

export function PlatformBadge({ platform }: { platform: Platform }) {
  const styles =
    platform === Platform.META
      ? "bg-blue-50 text-blue-700"
      : "bg-emerald-50 text-emerald-700";
  const label = platform === Platform.META ? "Meta" : "Google";
  return <span className={cn("badge", styles)}>{label}</span>;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "active",
  PAUSED: "en pause",
  ARCHIVED: "archivée",
  UNKNOWN: "inconnu",
  SUCCESS: "succès",
  FAILED: "échec",
  SKIPPED: "ignoré",
};

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAUSED: "bg-amber-50 text-amber-700",
    ARCHIVED: "bg-slate-100 text-slate-600",
    UNKNOWN: "bg-slate-100 text-slate-600",
    SUCCESS: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-red-50 text-red-700",
    SKIPPED: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("badge", map[status] ?? "bg-slate-100 text-slate-600")}>
      {STATUS_LABELS[status] ?? status.toLowerCase()}
    </span>
  );
}
