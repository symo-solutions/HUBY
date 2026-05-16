/**
 * Helpers pour les champs JSON stockés en TEXT.
 *
 * Prisma n'a pas de type Json natif sur SQLite : on stocke donc les
 * payloads libres (paramètres de règles, métadonnées des logs
 * d'automatisation) en TEXT, et on (dé)sérialise ici. Les mêmes helpers
 * fonctionneront tels quels si on passe plus tard sur Postgres (il
 * suffira de changer la colonne en `Json`).
 */

export function toJsonField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && Object.keys(value as object).length === 0) {
    return "{}";
  }
  return JSON.stringify(value);
}

export function fromJsonField<T = Record<string, unknown>>(
  value: string | null | undefined,
): T | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
