// Level-1 source: the five CSV files loaded by lib/ingest form the whole effective set, every row
// with origin `batch`. Nothing is pending or published, so nothing is superseded.
import { ENTITIES, type Dataset, type Entity as RowEntity } from "../../ingest";
import type { Entity, FileUnit, RowUnit, Source, Unit } from "../types";

/** Batch id of a CSV run; a constant so that the journal does not depend on the machine. */
export const CSV_BATCH_ID = "csv";

function toUnits<E extends RowEntity>(dataset: Dataset, entity: E, batchId: string): readonly RowUnit<E>[] {
  return Object.freeze(dataset.rows[entity].map((row): RowUnit<E> => ({ ...row, origin: "batch", batchId })));
}

export function datasetSource(dataset: Dataset, batchId: string = CSV_BATCH_ID): Source {
  const rows = {} as { readonly [E in RowEntity]: readonly RowUnit<E>[] };
  const files: FileUnit[] = [];
  for (const entity of ENTITIES) {
    const units = toUnits(dataset, entity, batchId);
    (rows as Record<RowEntity, readonly RowUnit[]>)[entity] = units;
    files.push({
      unitId: dataset.files[entity].fileName,
      entity: "file",
      fileEntity: entity,
      recordKey: null,
      file: dataset.files[entity],
      rowUnitIds: units.map((u) => u.unitId),
    });
  }
  const fileUnits = Object.freeze(files);

  return {
    batchId,
    units<E extends Entity>(entity: E): readonly Unit<E>[] {
      return (entity === "file" ? fileUnits : rows[entity as RowEntity]) as readonly Unit<E>[];
    },
    superseded: () => [],
  };
}
