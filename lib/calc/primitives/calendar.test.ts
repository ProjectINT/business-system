import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calendarDate } from "../testing/arbitraries";
import { expectCode } from "../testing/expect";
import {
  addDays,
  dateIn,
  eachNight,
  fromEpochDay,
  inPeriod,
  nightsBetween,
  parseDate,
  period,
  toEpochDay,
  type CalendarDate,
} from "./calendar";

const d = parseDate;

describe("calendar", () => {
  it.each<[string, string, number]>([
    ["2026-09-28", "2026-10-04", 6],
    ["2026-10-25", "2026-11-01", 7], // R0003
    ["2026-10-31", "2026-11-02", 2], // 49 hours in Los Angeles
    ["2028-02-28", "2028-03-01", 2],
    ["2026-12-31", "2027-01-01", 1],
    ["2026-09-15", "2026-09-15", 0],
  ])("nightsBetween(%s, %s) = %s", (a, b, n) => expect(nightsBetween(d(a), d(b))).toBe(n));

  it("eachNight lists the nights of [check_in, check_out)", () => {
    expect(eachNight(d("2026-09-28"), d("2026-10-04"))).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(eachNight(d("2026-09-15"), d("2026-09-15"))).toEqual([]);
    expect(eachNight(d("2026-09-16"), d("2026-09-15"))).toEqual([]);
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-9-1", "2026-09-01T00:00:00Z", "20260901", "0050-01-01", "", "2026-02-29"])(
    "parseDate(%j) → INVALID_DATE",
    (t) => expectCode(() => parseDate(t), "INVALID_DATE"),
  );

  it("accepts leap day and epoch boundaries", () => {
    expect(parseDate("2028-02-29")).toBe("2028-02-29");
    expect(toEpochDay(d("1970-01-01"))).toBe(0);
    expect(fromEpochDay(0)).toBe("1970-01-01");
    expect(addDays(d("2026-11-01"), -1)).toBe("2026-10-31");
  });

  it("periods include both bounds", () => {
    const sep = period(d("2026-09-01"), d("2026-09-30"));
    expect(inPeriod(sep, d("2026-09-30"))).toBe(true);
    expect(inPeriod(sep, d("2026-09-01"))).toBe(true);
    expect(inPeriod(sep, d("2026-10-01"))).toBe(false);
    expect(inPeriod(sep, d("2026-08-31"))).toBe(false);
    expect(period(d("2026-09-01"), d("2026-09-01"))).toEqual({ from: "2026-09-01", to: "2026-09-01" });
    expectCode(() => period(d("2026-10-01"), d("2026-09-30")), "INVALID_PERIOD");
  });

  it("does not depend on the process time zone", () => {
    // Runs under TZ=Pacific/Kiritimati and TZ=America/Los_Angeles in test:calc:tz.
    expect(nightsBetween(d("2026-10-31"), d("2026-11-02"))).toBe(2);
    expect(eachNight(d("2026-10-31"), d("2026-11-03"))).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("dateIn: the date in the given zone, not in the process zone; Bali is UTC+8", () => {
    expect(dateIn(new Date("2026-10-18T15:59:59Z"), "Asia/Makassar")).toBe("2026-10-18");
    expect(dateIn(new Date("2026-10-18T16:00:00Z"), "Asia/Makassar")).toBe("2026-10-19");
    expect(dateIn(new Date("2026-10-18T16:00:00Z"), "UTC")).toBe("2026-10-18");
    expect(dateIn(new Date("2028-02-29T12:00:00Z"), "Asia/Makassar")).toBe("2028-02-29");
  });

  it("properties: addDays/nightsBetween, parse/format, eachNight length", () => {
    fc.assert(
      fc.property(calendarDate, fc.integer({ min: 0, max: 60 }), (date: CalendarDate, k) => {
        const later = addDays(date, k);
        expect(nightsBetween(date, later)).toBe(k);
        expect(parseDate(date)).toBe(date);
        expect(fromEpochDay(toEpochDay(date))).toBe(date);
        expect(eachNight(date, later)).toHaveLength(k);
        expect(later >= date).toBe(true);
      }),
    );
  });
});
