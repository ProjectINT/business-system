import { describe, expect, it } from "vitest";
import { ENTITIES, loadDataset } from "../../ingest";
import { datasetFrom } from "../testing/fixture";
import { CSV_BATCH_ID, datasetSource } from "./dataset";

describe("datasetSource on the sample files", () => {
  const ds = loadDataset();
  const source = datasetSource(ds);

  it("gives every row of every file as a batch unit, with the file's rows and ids", () => {
    let total = 0;
    for (const entity of ENTITIES) {
      const units = source.units(entity);
      expect(units).toHaveLength(ds.rows[entity].length);
      expect(units.every((u) => u.origin === "batch" && u.batchId === CSV_BATCH_ID && u.entity === entity)).toBe(true);
      total += units.length;
    }
    expect(total).toBe(357);
    expect(source.batchId).toBe("csv");
  });

  it("gives one file unit per entity, with its rows", () => {
    const files = source.units("file");
    expect(files.map((f) => f.unitId)).toEqual([
      "properties.csv",
      "commission_rules.csv",
      "reservations.csv",
      "payments.csv",
      "expenses.csv",
    ]);
    const reservations = files[2]!;
    expect(reservations.entity).toBe("file");
    expect(reservations.fileEntity).toBe("reservation");
    expect(reservations.recordKey).toBeNull();
    expect(reservations.file.rowCount).toBe(151);
    expect(reservations.rowUnitIds).toEqual(source.units("reservation").map((u) => u.unitId));
  });

  it("returns the same arrays on every call", () => {
    expect(source.units("payment")).toBe(source.units("payment"));
    expect(source.units("file")).toBe(source.units("file"));
    expect(Object.isFrozen(source.units("payment"))).toBe(true);
  });

  it("has nothing superseded at level 1", () => {
    expect(source.superseded()).toEqual([]);
  });
});

describe("datasetSource on small datasets", () => {
  it("takes the batch id given", () => {
    const source = datasetSource(datasetFrom({}), "batch-7");
    expect(source.batchId).toBe("batch-7");
    expect(source.units("reservation")).toEqual([]);
    expect(source.units("file")).toHaveLength(5);
  });
});
