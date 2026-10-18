import { createHash } from "node:crypto";
import { FIELDS, type Entity } from "./entities";

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Target fields in canonical order, values trimmed, absent column → null. Two exports of the same
 * record with a different column order or extra columns give the same object, hence the same hash.
 */
export function canonicalRow(entity: Entity, raw: Readonly<Record<string, string | undefined>>) {
  const canon: Record<string, string | null> = {};
  for (const column of FIELDS[entity]) {
    const value = raw[column];
    canon[column] = value === undefined ? null : value.trim();
  }
  return canon;
}

/** sha256 of the canonical JSON of the target fields (IMPORT_PLAN.md 6). */
export function rowHash(entity: Entity, raw: Readonly<Record<string, string | undefined>>): string {
  return sha256(JSON.stringify(canonicalRow(entity, raw)));
}
