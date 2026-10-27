// Строки ночей и платежи → отчёт в форме final-test/output_schema.json (docs/FINAL_TEST_PLAN.md, 3.3).
//
// Место файла в цепочке (index.ts, runCase):
// - schema.ts разбирает и проверяет входной JSON;
// - snapshots.ts выбирает последнюю версию каждой брони, делит её на ночи с комиссией (fees.ts),
//   раскладывает платежи по корзинам received / held / unmatched и собирает исключения;
// - этот файл только складывает готовое по месяцам и виллам, ничего не решает заново;
// - toView переводит суммы из bigint в обычные числа, formatReport — в текст JSON.
//
// Шесть показателей на месяц:
// - accommodation (проживание без PBJT), PBJT, OTA fee и комиссия УК — суммы строк ночей, которые
//   приходятся на этот месяц (ТЗ 7);
// - owner_estimate = accommodation − ota_fee − management_fee (ТЗ 8) — оценка результата собственника
//   до расходов и выплат, а не сумма к выплате;
// - cash_received — полученные платежи принятых броней по месяцу payment_date (ТЗ 7). Деньги и ночи
//   могут попасть в разные месяцы: P202 оплачен 28.11 за ночи 10–11.12, поэтому у V02 в ноябре
//   деньги 2 200 000 при нулевом начислении.
//
// Основа — сетка «вилла × месяц», в каждой клетке копятся суммы. by_property — сама сетка, monthly —
// её сумма по виллам, total — сумма по месяцам. Три блока сходятся по построению: их не считают
// трижды и не сверяют, это одни и те же клетки.
//
// Период — report_months (план 4.2). Ночь или полученный платёж вне этих месяцев не входят ни в один
// показатель; на запись пишется одно исключение OUTSIDE_REPORT_MONTHS, а ночи брони всё равно видны
// в trace. cash_held_idr и cash_unmatched_idr — не показатели периода: в них входит каждый задержанный
// или непривязанный платёж с любой датой, чтобы известные нам деньги не пропали из отчёта (ТЗ 4 D).
//
// trace — строка на каждую бронь, принятую или на hold: выбранный source_event_id, вытесненные им
// версии и, у принятой брони, ночи по месяцам со ставками этих ночей. Ставок в месяце больше одной,
// если правило комиссии сменилось внутри месяца.
//
// Результат зависит только от входа: месяцы и виллы перебираются в отсортированном порядке, исключения —
// один список, отсортированный по записи, а formatReport сортирует ключи на каждом уровне JSON.
import { idr, type Money, type View } from "../calc";
import type { NightLine } from "./fees";
import type { CaseInput } from "./schema";
import { compareStrings, type ReservationDecision, type Snapshots } from "./snapshots";
import type { Dedup, Exception } from "./types";

/** Шесть показателей: за месяц, за весь период или по одной вилле за месяц. */
export interface Metrics {
  readonly accommodation_gross_idr: Money;
  readonly pbjt_liability_idr: Money;
  readonly ota_fee_idr: Money;
  readonly management_fee_idr: Money;
  /** accommodation − ota_fee − management_fee (ТЗ 8). Может быть отрицательной, если OTA fee больше, чем остаётся после комиссии УК: снизу не обрезается. */
  readonly owner_estimate_idr: Money;
  readonly cash_received_idr: Money;
}

/** Одна бронь за один месяц в trace. */
export interface TraceMonth {
  /** Сколько ночей брони в этом месяце. */
  readonly nights: number;
  /** Разные ставки ночей месяца в порядке ночей: одна, если правило не менялось внутри месяца. У R101: ноябрь [1700], декабрь [2000]. */
  readonly rate_bps: readonly number[];
  readonly accommodation_gross_idr: Money;
  readonly management_fee_idr: Money;
}

/** Строка trace на одну бронь: какое решение принято и из каких ночей сложились её суммы. */
export interface TraceEntry {
  /** Использованная версия или та, что не прошла проверки; null, если версию выбрать нельзя (CONFLICTING_EVENT, AMBIGUOUS_VERSION). */
  readonly selected_source_event_id: string | null;
  /** Версии, которые выбранная заменила (ТЗ 10). */
  readonly superseded_source_event_ids: readonly string[];
  /** true — бронь не вошла в итоги, причина в exceptions. */
  readonly hold: boolean;
  /** Сколько ночей начислено: 0 у брони на hold. */
  readonly nights: number;
  /** Все месяцы начисленных ночей, и в окне отчёта, и вне его. */
  readonly monthly: Readonly<Record<string, TraceMonth>>;
}

/** Весь отчёт; поля — как в output_schema.json. */
export interface Report {
  readonly schema_version: 1;
  readonly case_id: string;
  /** По месяцам report_months. */
  readonly monthly: Readonly<Record<string, Metrics>>;
  /** Сумма `monthly`. */
  readonly total: Metrics;
  /** По виллам из `properties`, внутри — по месяцам report_months; у виллы без движения нули. */
  readonly by_property: Readonly<Record<string, Readonly<Record<string, Metrics>>>>;
  /** Полученные платежи по броням, о которых не пришло ни одного события (ТЗ 13). */
  readonly cash_unmatched_idr: Money;
  /** pending-платежи, платежи с незнакомым статусом и полученные платежи броней на hold (план 4.1). */
  readonly cash_held_idr: Money;
  /** Счётчики дублей и вытесненных версий — готовые из snapshots.ts. */
  readonly dedup: Dedup;
  /** Сначала брони по id, затем платежи по id; коды одной записи — в порядке проверок. */
  readonly exceptions: readonly Exception[];
  /** По reservation_id — каждая бронь входа. */
  readonly trace: Readonly<Record<string, TraceEntry>>;
}

/** Отчёт, где Money заменены числами: его возвращает runCase и пишет CLI. */
export type ReportView = View<Report>;

/**
 * Накопитель одной клетки сетки «вилла × месяц». Суммы в bigint — точная целочисленная арифметика,
 * без ошибок округления, как у float. owner_estimate здесь не хранится: его считает metrics из этих
 * сумм, поэтому он всегда с ними согласован.
 */
interface Cell {
  accommodation: bigint; // проживание без PBJT
  pbjt: bigint; // PBJT — обязательство перед государством, не доход
  ota: bigint; // комиссия канала
  fee: bigint; // комиссия УК
  cash: bigint; // полученные деньги по месяцу payment_date
}

/** Пустая клетка, все суммы 0. Каждый вызов — новый объект: клетки меняются на месте и не должны делить одно состояние. */
function emptyCell(): Cell {
  return { accommodation: 0n, pbjt: 0n, ota: 0n, fee: 0n, cash: 0n };
}

/** Прибавляет к клетке одну ночь брони. cash не трогаем: деньги приходят отдельно, платежами. */
function addNight(cell: Cell, n: NightLine): void {
  cell.accommodation += n.accommodation_gross_idr;
  cell.pbjt += n.pbjt_idr;
  cell.ota += n.ota_fee_idr;
  cell.fee += n.management_fee_idr;
}

/** Прибавляет одну клетку к другой, все пять сумм. Так из клеток вилл складываются monthly и total. */
function addCell(into: Cell, from: Cell): void {
  into.accommodation += from.accommodation;
  into.pbjt += from.pbjt;
  into.ota += from.ota;
  into.fee += from.fee;
  into.cash += from.cash;
}

/**
 * Клетка → шесть показателей отчёта: суммы становятся Money в рупиях, owner_estimate считается здесь (ТЗ 8).
 * Пример, V01 за ноябрь: 2 200 000 − 330 000 − 374 000 = 1 496 000.
 */
function metrics(c: Cell): Metrics {
  return {
    accommodation_gross_idr: idr(c.accommodation),
    pbjt_liability_idr: idr(c.pbjt),
    ota_fee_idr: idr(c.ota),
    management_fee_idr: idr(c.fee),
    owner_estimate_idr: idr(c.accommodation - c.ota - c.fee),
    cash_received_idr: idr(c.cash),
  };
}

/** Исключение OUTSIDE_REPORT_MONTHS для брони или платежа: часть суммы или вся сумма вне report_months и в итоги не вошла. */
function outsideWindow(record_type: Exception["record_type"], record_id: string): Exception {
  return { record_type, record_id, code: "OUTSIDE_REPORT_MONTHS", action: "hold" };
}

/**
 * Порядок exceptions: сначала брони, потом платежи, внутри — по id.
 * Сортировка в JS стабильна: элементы с одинаковым ключом сохраняют исходный порядок, поэтому коды одной
 * записи остаются в порядке проверок.
 */
function byRecord(a: Exception, b: Exception): number {
  if (a.record_type !== b.record_type) return a.record_type === "reservation" ? -1 : 1;
  return compareStrings(a.record_id, b.record_id);
}

/** Сумма одного поля по строкам ночей; начальное значение 0n, потому что суммы — bigint. */
function sumOf(lines: readonly NightLine[], key: "accommodation_gross_idr" | "management_fee_idr"): bigint {
  return lines.reduce((acc, n) => acc + n[key], 0n);
}

/**
 * Строка trace для одной брони.
 *
 * 1. Ночи: у брони на hold их не считаем — пустой список, поэтому nights = 0 и monthly = {}.
 * 2. По каждому месяцу, где есть ночи: сколько ночей, какие ставки, сумма проживания и комиссии УК.
 *    Месяцы вне окна отчёта тоже сюда попадают: в trace видно, что ночи были, хотя в итоги они не вошли.
 * 3. Выбранная и вытесненные версии — как решил snapshots.ts.
 *
 * Публичный кейс: R101 — снимок E_R101_V2, superseded = ["E_R101_V1"], 4 ночи; ноябрь — 2 ночи, [1700],
 * 2 200 000 и 374 000; декабрь — 2 ночи, [2000], 2 200 000 и 440 000. R303 (USD) — hold: снимок E_R303
 * указан (именно он не прошёл проверку), ночей 0.
 */
function traceOf(r: ReservationDecision): TraceEntry {
  // 1
  const nights = r.hold ? [] : r.nights;
  // 2
  const monthly: Record<string, TraceMonth> = {};
  for (const month of new Set(nights.map((n) => n.month))) {
    // Ночи идут по порядку дат, а Set хранит значения без повторов в порядке добавления:
    // месяцы и ставки внутри месяца выходят в порядке ночей.
    const lines = nights.filter((n) => n.month === month);
    monthly[month] = {
      nights: lines.length,
      rate_bps: [...new Set(lines.map((n) => n.rate_bps))],
      accommodation_gross_idr: idr(sumOf(lines, "accommodation_gross_idr")),
      management_fee_idr: idr(sumOf(lines, "management_fee_idr")),
    };
  }
  // 3
  return {
    selected_source_event_id: r.snapshot?.source_event_id ?? null, // у брони на hold снимка может не быть
    superseded_source_event_ids: r.superseded,
    hold: r.hold,
    nights: nights.length,
    monthly,
  };
}

/**
 * Главная функция файла: решения snapshots.ts → отчёт.
 *
 * Шаги:
 * 0. Сетка: виллы из properties × месяцы из report_months, обе оси отсортированы, во всех клетках нули.
 *    Вилла или месяц без движения так и остаются с нулями, но в by_property всё равно есть.
 * 1. Начисления. Каждой брони — строка trace. Ночи принятой брони раскладываются по клеткам её виллы
 *    и месяца ночи. Месяца нет в сетке — ночь вне окна, она пропускается; пропущена хоть одна ночь —
 *    на бронь одно OUTSIDE_REPORT_MONTHS. Бронь на границе окна режется по ночам: ночи внутри окна
 *    считаются (план 4.2).
 * 2. Деньги. received — в клетку виллы брони и месяца payment_date; месяц вне окна → OUTSIDE_REPORT_MONTHS,
 *    платёж никуда не входит. held и unmatched — в свои общие суммы, без месяца и без проверки окна.
 * 3. Чтение. Каждая клетка → показатели by_property; та же клетка прибавляется к своему месяцу (monthly)
 *    и ко всему периоду (total).
 * 4. Сборка: исключения из snapshots.ts и OUTSIDE_REPORT_MONTHS — один список, отсортированный по записи.
 *
 * Публичный кейс: R101 (V01, 29.11–03.12) — по 2 ночи в ноябре и декабре, R202 (V02) — 2 ночи в декабре,
 * R303 на hold (USD) в итоги не входит. P101 (07.12) → декабрь V01, P202 (28.11) → ноябрь V02,
 * P303 (pending) → cash_held 50 000, P404 на несуществующую R999 → cash_unmatched 100 000.
 */
export function buildReport(input: CaseInput, snapshots: Snapshots): Report {
  // 0
  const months = [...input.report_months].sort(compareStrings); // копия: входной массив не меняем
  const villas = input.properties.map((p) => p.property_id).sort(compareStrings);
  // вилла → (месяц → клетка). Map перебирается в порядке добавления, то есть по отсортированным осям.
  const grid = new Map(villas.map((v) => [v, new Map(months.map((m) => [m, emptyCell()]))]));
  const outside: Exception[] = []; // OUTSIDE_REPORT_MONTHS, найденные здесь
  const trace: Record<string, TraceEntry> = {};

  // 1. Начисления: каждая ночь — в клетку своей виллы и месяца; ночь вне окна не считается, о ней пишется исключение.
  for (const r of snapshots.reservations) {
    trace[r.reservation_id] = traceOf(r); // trace есть у каждой брони, и у брони на hold
    if (r.hold) continue;
    const cells = grid.get(r.snapshot.property_id)!; // `!`: принятый снимок прошёл UNKNOWN_PROPERTY, его вилла есть в сетке
    let counted = 0; // сколько ночей брони попало в окно
    for (const n of r.nights) {
      const cell = cells.get(n.month);
      if (cell === undefined) continue; // месяца ночи нет в report_months
      addNight(cell, n);
      counted += 1;
    }
    // Одно исключение на бронь, сколько бы ночей ни выпало из окна.
    if (counted < r.nights.length) outside.push(outsideWindow("reservation", r.reservation_id));
  }

  // 2. Деньги: полученные — в клетку виллы брони и месяца payment_date; задержанные и непривязанные — в свои общие суммы.
  let held = 0n;
  let unmatched = 0n;
  for (const p of snapshots.payments) {
    if (p.bucket === "received") {
      // "2026-12-07".slice(0, 7) = "2026-12". `!`: received бывает только у принятой брони, её вилла есть в сетке.
      const cell = grid.get(p.property_id)!.get(p.payment.payment_date.slice(0, 7));
      if (cell === undefined) outside.push(outsideWindow("payment", p.payment.payment_id));
      else cell.cash += p.payment.amount_idr;
    } else if (p.bucket === "held") {
      held += p.payment.amount_idr; // pending, незнакомый статус или бронь на hold
    } else {
      unmatched += p.payment.amount_idr; // такую бронь не присылали (ТЗ 13)
    }
  }

  // 3. Чтение: by_property — сама сетка; monthly и total — её суммы.
  const byMonth = new Map(months.map((m) => [m, emptyCell()])); // сумма по виллам для каждого месяца
  const period = emptyCell(); // сумма за весь период
  const by_property: Record<string, Readonly<Record<string, Metrics>>> = {};
  for (const [villa, cells] of grid) {
    const row: Record<string, Metrics> = {};
    for (const [month, cell] of cells) {
      row[month] = metrics(cell);
      addCell(byMonth.get(month)!, cell); // `!`: у сетки и byMonth одни и те же месяцы
      addCell(period, cell);
    }
    by_property[villa] = row;
  }

  // 4. Сборка отчёта.
  return {
    schema_version: 1,
    case_id: input.case_id,
    monthly: Object.fromEntries([...byMonth].map(([month, cell]) => [month, metrics(cell)])),
    total: metrics(period),
    by_property,
    cash_unmatched_idr: idr(unmatched),
    cash_held_idr: idr(held),
    dedup: snapshots.dedup,
    exceptions: [...snapshots.exceptions, ...outside].sort(byRecord), // OUTSIDE_REPORT_MONTHS встают к своим записям
    trace,
  };
}

/**
 * Заменитель для JSON.stringify (второй аргумент). JSON.stringify вызывает его для каждого значения,
 * начиная с самого отчёта (ключ ""), и пишет то, что он вернул.
 *
 * Объект возвращается копией с ключами по алфавиту. JSON.stringify выводит ключи в порядке их
 * добавления, поэтому в тексте они отсортированы — на каждом уровне, потому что заменитель вызывается
 * и для вложенных объектов. Массивы не трогаем: их порядок несёт смысл (exceptions, rate_bps) и уже
 * задан при построении отчёта. Числа, строки, null — как есть.
 */
function sortedKeys(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => compareStrings(a, b)));
}

/**
 * Текст отчёта, как его пишет CLI: ключи отсортированы на каждом уровне, отступ два пробела, перевод
 * строки в конце. Один вход — всегда одни и те же байты. На входе ReportView (числа, а не bigint):
 * JSON.stringify на bigint падает с ошибкой.
 */
export function formatReport(report: ReportView): string {
  return `${JSON.stringify(report, sortedKeys, 2)}\n`;
}
