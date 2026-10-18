import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseCsv } from "./csv";
import { ENTITIES, FILE_NAMES, type Entity } from "./entities";
import { IngestError } from "./errors";
import type { Dataset, ParsedFile } from "./types";

/** The sample files shipped in the repository, relative to the process working directory. */
export const DEFAULT_DATA_DIR = "Technical_Challenge_Data";

export function loadFile<E extends Entity>(entity: E, path: string): ParsedFile<E> {
  const fileName = basename(path);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new IngestError("FILE_NOT_FOUND", fileName, path);
    throw e;
  }
  return parseCsv(entity, bytes, fileName);
}

/**
 * All five files of a directory, by their standard names (PLAN.md 5.1). Source files are never written.
 * The directory comes from the caller, so the bundler must not trace it: a dynamic path would pull the
 * whole project into the server output. The sample files are included by `outputFileTracingIncludes`.
 */
export function loadDataset(dir: string = DEFAULT_DATA_DIR): Dataset {
  const resolved = resolve(/* turbopackIgnore: true */ dir);
  const files = {} as { [E in Entity]: Dataset["files"][E] };
  const rows = {} as { [E in Entity]: Dataset["rows"][E] };
  for (const entity of ENTITIES) {
    const parsed = loadFile(entity, join(/* turbopackIgnore: true */ resolved, FILE_NAMES[entity]));
    files[entity] = parsed.file;
    (rows as Record<Entity, unknown>)[entity] = parsed.rows;
  }
  return { dir: resolved, files, rows };
}
