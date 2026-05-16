/**
 * Helpers for JSON-as-TEXT fields.
 *
 * SQLite doesn't have a native Json type in Prisma, so we store free-form
 * payloads (rule params, automation log metadata) as TEXT and (de)serialize
 * here. The same helpers work transparently if we later move to Postgres
 * (we'd just switch the column type back to `Json`).
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
