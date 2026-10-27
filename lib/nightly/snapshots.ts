// Reservation events → one snapshot per reservation (latest updated_at) with its night lines,
// payments without duplicates, dedup counters and exceptions (docs/FINAL_TEST_PLAN.md, 3.1).
//
// The night lines (fees.ts) are built here, right after the checks of the snapshot: a night without
// a rule holds the reservation, and payments are placed only after every hold is known, so such a
// reservation's payment is held (PAYMENT_HELD), not counted as the villa's cash.
//
// Only the input decides the result: records are grouped by their ids, a tie between equal versions
// goes to the smaller source_event_id, and every list is sorted by its key — a reordered input gives
// the same output. Content is compared on the parsed record, so an unknown extra field or another
// spelling of the same instant does not make two copies differ.
import { nightLines, type NightLine } from "./fees";
import type { CaseInput, CommissionRule, Payment, Property, ReservationEvent } from "./schema";
import type { Dedup, Exception, ExceptionCode } from "./types";

/** The latest version of a reservation, or why none can be used. `hold` — nothing of it enters the confirmed totals. */
export type ReservationDecision =
  | {
      readonly hold: false;
      readonly reservation_id: string;
      readonly snapshot: ReservationEvent;
      /** source_event_ids of the versions the snapshot replaced, sorted. */
      readonly superseded: readonly string[];
      /** One line per night of the stay, chronological (fees.ts). */
      readonly nights: readonly NightLine[];
    }
  | {
      readonly hold: true;
      readonly reservation_id: string;
      /** null — no version could be chosen (CONFLICTING_EVENT, AMBIGUOUS_VERSION). */
      readonly snapshot: ReservationEvent | null;
      readonly superseded: readonly string[];
    };

/**
 * Where the money of a payment goes. `received` — the villa's cash of the month of payment_date;
 * `held` — money we know of but do not attribute yet (pending, received for a reservation on hold,
 * a status we do not know); `unmatched` — received for a reservation nobody sent (ТЗ 13).
 * A conflicting payment (one id, different content) has no amount to place: exception only.
 */
export type PaymentDecision =
  | { readonly bucket: "received"; readonly payment: Payment; readonly property_id: string }
  | { readonly bucket: "held" | "unmatched"; readonly payment: Payment };

export interface Snapshots {
  /** By reservation_id. */
  readonly reservations: readonly ReservationDecision[];
  /** By payment_id. */
  readonly payments: readonly PaymentDecision[];
  readonly dedup: Dedup;
  /** Reservations first, then payments, each by id; codes in the order they were checked. */
  readonly exceptions: readonly Exception[];
}

const ACCEPTED_STATUSES: ReadonlySet<string> = new Set(["confirmed", "modified"]);

/**
 * Сравнение двух строк для сортировки: 1 — a больше b, -1 — меньше, 0 — равны.
 * `Number(true)` = 1, `Number(false)` = 0, поэтому разность и даёт нужное число.
 *
 * Строки сравниваются по кодам символов, как оператором `<`, а не через `localeCompare`:
 * порядок `localeCompare` зависит от языка и настроек машины, а отчёт должен совпадать байт в байт
 * на любом компьютере. Этим же сравнением report.ts сортирует месяцы, виллы и ключи JSON.
 *
 * Сортируются всегда разные ключи (id записей, месяцы, виллы), поэтому 0 на практике не возвращается.
 */
export function compareStrings(a: string, b: string): number {
  return Number(a > b) - Number(a < b);
}

/**
 * Раскладывает список по группам. Ключ группы считает `key`; внутри группы записи идут в том
 * порядке, в каком пришли во входе.
 *
 * Пример: события, сгруппированные по `source_event_id`, — две одинаковые копии E_R101_V1 попадут
 * в одну группу, E_R101_V2 — в свою.
 *
 * Группы в Map идут в порядке первого появления ключа во входе. Там, где этот порядок мог бы
 * повлиять на результат, вызывающий код сортирует ключи сам (`compareStrings`), поэтому
 * переставленный вход даёт тот же отчёт.
 */
function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

/**
 * «Отпечаток» содержания записи — строка, по которой решаем, копии это или разные данные.
 * Равные строки — одинаковое содержание.
 *
 * Как строится:
 * - берутся все поля, кроме идентификатора `idField`. У копий одного события id и так один, а у двух
 *   версий брони он разный, хотя сравнить нужно именно содержание;
 * - поля сортируются по имени, так что порядок ключей в исходном JSON ни на что не влияет;
 * - результат записывается как JSON.
 *
 * Сравнивается уже разобранная запись (после schema.ts), а не исходный текст файла:
 * - неизвестное лишнее поле zod уже отбросил, оно не делает копии разными;
 * - `updated_at` уже число миллисекунд, поэтому "…T09:00:00Z" и "…T13:00:00+04:00" — одно и то же время.
 *
 * Суммы после разбора — `bigint`, а JSON.stringify на bigint падает с ошибкой. Поэтому функция-заменитель
 * (второй аргумент JSON.stringify) записывает их строкой вида "4000000n".
 */
function contentKey(record: object, idField: string): string {
  const entries = Object.entries(record)
    .filter(([k]) => k !== idField)
    .sort(([a], [b]) => compareStrings(a, b));
  return JSON.stringify(entries, (_key, value: unknown) => (typeof value === "bigint" ? `${value}n` : value));
}

/**
 * Сколько разных содержаний среди записей (сравнение по contentKey, без поля `idField`).
 *
 * 1 — все записи одинаковые: это повторы одной и той же записи, учитываем одну.
 * Больше 1 — пришли разные данные там, где должна быть одна запись (один id или один момент
 * updated_at). Это конфликт: выбрать одну из них значило бы придумать правило (ТЗ 14).
 */
function distinctContents(copies: readonly object[], idField: string): number {
  return new Set(copies.map((c) => contentKey(c, idField))).size;
}

/**
 * `source_event_id` версий брони, отсортированные. Так вытесненные версии попадают в `superseded`,
 * а оттуда в `trace` отчёта, в одном и том же порядке при любом порядке входа.
 */
function sourceEventIds(events: readonly ReservationEvent[]): string[] {
  return events.map((e) => e.source_event_id).sort(compareStrings);
}

/**
 * Одна строка списка `exceptions` в отчёте.
 *
 * `record_type` — к чему относится: бронь или платёж; `record_id` — reservation_id или payment_id;
 * `code` — причина (все коды с пояснениями — в types.ts).
 * `action` всегда "hold": сумма записи не вошла в подтверждённые итоги и ждёт проверки человеком (план 4.5).
 */
function exception(record_type: Exception["record_type"], record_id: string, code: ExceptionCode): Exception {
  return { record_type, record_id, code, action: "hold" };
}

/**
 * Проверки выбранного снимка брони (план 3.1, шаг 3). Возвращает коды ошибок; пустой список — снимок годен.
 * Любой код ставит на hold всю бронь: её ночи не входят в итоги, а полученный по ней платёж
 * уходит в cash_held (PAYMENT_HELD).
 *
 * Что проверяется:
 * - UNKNOWN_PROPERTY — виллы нет в `properties`. Тогда и валюту сравнивать не с чем, отсюда `else if`;
 * - CURRENCY_MISMATCH — валюта брони не совпадает с базовой валютой виллы или эта валюта не IDR.
 *   Пример: R303 в USD у виллы V01 с базовой IDR. Вилла с базовой USD тоже не проходит (план 4.9);
 * - INVALID_STAY — выезд не позже заезда, то есть ни одной ночи. Даты — строки YYYY-MM-DD,
 *   поэтому сравнение строк совпадает со сравнением дат;
 * - UNKNOWN_STATUS — статус не confirmed и не modified. Сюда попадает и cancelled: в ТЗ он не описан,
 *   правило для него не придумываем (план 4.4).
 *
 * Проверяется только последняя версия: если в старой был USD, а в новой его исправили на IDR,
 * бронь принимается (план 4.10). Коды идут в порядке проверок, чтобы вывод не менялся от запуска к запуску.
 */
function checkSnapshot(s: ReservationEvent, properties: ReadonlyMap<string, Property>): ExceptionCode[] {
  const codes: ExceptionCode[] = [];
  const property = properties.get(s.property_id);
  if (property === undefined) codes.push("UNKNOWN_PROPERTY");
  // Отчёт в рупиях без пересчёта курса: бронь должна быть в базовой валюте виллы, и это должна быть IDR (ТЗ 12).
  else if (s.currency !== property.base_currency || s.currency !== "IDR") codes.push("CURRENCY_MISMATCH");
  if (s.check_out <= s.check_in) codes.push("INVALID_STAY");
  if (!ACCEPTED_STATUSES.has(s.status)) codes.push("UNKNOWN_STATUS");
  return codes;
}

/**
 * Решение по одной брони: какая версия актуальна и можно ли включать бронь в итоги.
 *
 * На входе — все версии брони (точные повторы событий уже убраны в selectSnapshots, шаг 1),
 * флаг `conflicted`, справочник вилл и правила комиссии. На выходе — решение и коды исключений.
 *
 * Порядок:
 * 1. Конфликт в ленте (под одним source_event_id разное содержание) → вся бронь на hold с
 *    CONFLICTING_EVENT, даже если есть чистая более поздняя версия: ленте по этой брони верить
 *    нельзя (план 4.10). Снимка нет (`null`).
 * 2. Находим наибольший updated_at (ТЗ 10). Версии с ним — «последние», остальные — устаревшие.
 * 3. Среди последних разное содержание → неизвестно, какую брать: AMBIGUOUS_VERSION, hold,
 *    снимка нет (ТЗ 14). Устаревшие всё равно перечисляются в `superseded`.
 * 4. Иначе все последние — одна и та же версия, пришедшая под разными source_event_id. Берём меньший id,
 *    а не первый во входе, чтобы результат не зависел от порядка записей; остальные — вытесненные (план 4.6).
 * 5. Проверяем снимок (checkSnapshot). Ошибка → hold; снимок сохраняем, чтобы в trace было видно,
 *    какая версия не прошла проверку.
 * 6. Делим бронь на ночи и ищем ставку каждой ночи (fees.ts). Нет правила или их несколько на какую-то
 *    ночь → hold с NO_COMMISSION_RULE / AMBIGUOUS_COMMISSION_RULE.
 * 7. Всё прошло — бронь принята (`hold: false`) вместе со строками ночей; отчёту остаётся их сложить.
 *
 * Пример из публичного кейса: у R101 версии E_R101_V1 (19.11) и E_R101_V2 (20.11). Снимок — V2,
 * `superseded` = ["E_R101_V1"], 4 ночи по 1 100 000, ставка ноября 17 %, декабря 20 %.
 */
function decideReservation(
  reservation_id: string,
  versions: readonly ReservationEvent[],
  conflicted: boolean,
  properties: ReadonlyMap<string, Property>,
  rules: readonly CommissionRule[],
): { decision: ReservationDecision; codes: readonly ExceptionCode[] } {
  // 1
  if (conflicted) {
    return { decision: { hold: true, reservation_id, snapshot: null, superseded: [] }, codes: ["CONFLICTING_EVENT"] };
  }
  // updated_at — миллисекунды, сравниваются как моменты времени. versions здесь не пуст: бронь без конфликта
  // попала в список, потому что у неё есть хотя бы одна версия.
  // 2,3
  const latestAt = versions.reduce((max, v) => (v.updated_at > max ? v.updated_at : max), versions[0]!.updated_at);
  const latest = versions.filter((v) => v.updated_at === latestAt);
  const previous = versions.filter((v) => v.updated_at !== latestAt);
  if (distinctContents(latest, "source_event_id") > 1) {
    const superseded = sourceEventIds(previous);
    return { decision: { hold: true, reservation_id, snapshot: null, superseded }, codes: ["AMBIGUOUS_VERSION"] };
  }
  // 4
  // Одинаковое содержание под несколькими source_event_id в один момент — одна версия; её представляет меньший id (план 4.6).
  const sorted = [...latest].sort((a, b) => compareStrings(a.source_event_id, b.source_event_id));
  const snapshot = sorted[0]!;
  const superseded = sourceEventIds([...previous, ...sorted.slice(1)]);
  const codes = checkSnapshot(snapshot, properties);
  if (codes.length > 0) return { decision: { hold: true, reservation_id, snapshot, superseded }, codes };
  // Снимок годен; теперь на каждую ночь нужно ровно одно правило комиссии (план 3.2).
  const fees = nightLines(snapshot, rules);
  if (fees.hold) return { decision: { hold: true, reservation_id, snapshot, superseded }, codes: fees.codes };
  return { decision: { hold: false, reservation_id, snapshot, superseded, nights: fees.nights }, codes: [] };
}

/**
 * Куда идут деньги одного платежа (план 3.1, платежи, шаги 2–3). Возвращает корзину и код
 * исключения; `null` — исключения нет, деньги засчитаны вилле.
 *
 * Проверки идут по порядку, решает первая сработавшая:
 * 1. pending — деньги ещё не получены (ТЗ 11): held + PENDING_PAYMENT. Статус проверяется первым,
 *    поэтому pending на несуществующую бронь — тоже просто PENDING_PAYMENT (план 4.11).
 * 2. Статус не received и не pending — неизвестно, пришли ли деньги: held + UNKNOWN_STATUS.
 * 3. О брони с таким reservation_id не пришло ни одного события → unmatched + UNMATCHED_PAYMENT (ТЗ 13):
 *    деньги не теряем, но и вилле не приписываем — неизвестно, чья это бронь.
 * 4. Бронь есть, но на hold (USD, конфликт версий, нет ставки, cancelled…) → held + PAYMENT_HELD.
 *    Деньги настоящие, но если засчитать их вилле, у неё появится кэш без начисления по брони,
 *    которую мы сами признали ошибочной (план 4.3).
 * 5. Иначе — received: поступление вилле этой брони. Месяц по payment_date выбирает report.ts.
 *
 * В самом платеже property_id нет, вилла берётся из снимка брони.
 * В `reservations` есть все брони, о которых пришло хоть одно событие, включая брони на hold,
 * поэтому «нет в reservations» значит именно «такую бронь не присылали».
 */
function decidePayment(
  payment: Payment,
  reservations: ReadonlyMap<string, ReservationDecision>,
): { decision: PaymentDecision; code: ExceptionCode | null } {
  if (payment.status === "pending") return { decision: { bucket: "held", payment }, code: "PENDING_PAYMENT" };
  if (payment.status !== "received") return { decision: { bucket: "held", payment }, code: "UNKNOWN_STATUS" };
  const reservation = reservations.get(payment.reservation_id);
  if (reservation === undefined) return { decision: { bucket: "unmatched", payment }, code: "UNMATCHED_PAYMENT" };
  if (reservation.hold) return { decision: { bucket: "held", payment }, code: "PAYMENT_HELD" };
  return { decision: { bucket: "received", payment, property_id: reservation.snapshot.property_id }, code: null };
}

/**
 * Главная функция файла: из разобранного кейса делает то, что нужно отчёту (report.ts), —
 * решения по броням, решения по платежам, счётчики дублей и список исключений.
 *
 * Три шага:
 * 1. События брони. Группируем по source_event_id. Все копии одинаковые — это повтор одного события
 *    (ТЗ 9): оставляем одну, лишние считаем в dedup.reservation_event_duplicates. Копии разные —
 *    источник прислал под одним id разные данные: не берём ни одну, а бронь (или брони, если в копиях
 *    разные reservation_id) помечаем конфликтной.
 * 2. Брони. Для каждой reservation_id по алфавиту — decideReservation: последняя версия, её проверки,
 *    ночи и комиссия. Вытесненные версии считаем в dedup.superseded_reservation_versions (ТЗ 10).
 * 3. Платежи. Группируем по payment_id, идём по алфавиту. Одинаковые копии — один платёж, лишние
 *    в dedup.payment_duplicates (ТЗ 11). Разные — CONFLICTING_PAYMENT: единой суммы нет, поэтому платёж
 *    не попадает ни в одну денежную сумму и виден только в exceptions (план 4.11). Остальные — decidePayment.
 *
 * Платежи разбираются после всех броней: бронь может встать на hold из-за ставки, а это выясняется
 * только при расчёте ночей на шаге 2. Её платёж тогда должен уйти в held, а не в received.
 *
 * Результат зависит только от входа: всё сортируется по id, текущей даты нет, переставленный вход даёт
 * тот же результат. Исключения — сначала брони, потом платежи, каждые по id.
 *
 * Публичный кейс: dedup = 1 / 1 / 1 — повтор E_R101_V1, вытесненная E_R101_V1 (её заменила V2), повтор P101.
 */
export function selectSnapshots(input: CaseInput): Snapshots {
  const exceptions: Exception[] = [];
  const dedup = { reservation_event_duplicates: 0, superseded_reservation_versions: 0, payment_duplicates: 0 };

  // 1. Точные копии события учитываются один раз (ТЗ 9); разное содержание под одним source_event_id — ошибка ленты.
  const versions: ReservationEvent[] = []; // по одной на source_event_id
  const conflicted = new Set<string>(); // reservation_id, которые названы в конфликтном событии
  for (const copies of groupBy(input.reservation_events, (e) => e.source_event_id).values()) {
    if (distinctContents(copies, "source_event_id") === 1) {
      dedup.reservation_event_duplicates += copies.length - 1;
      versions.push(copies[0]!); // копии одинаковые, любая годится
    } else {
      for (const copy of copies) conflicted.add(copy.reservation_id);
    }
  }

  // 2. Последняя версия каждой брони (ТЗ 10), проверки этого снимка, его строки ночей.
  const properties = new Map(input.properties.map((p) => [p.property_id, p]));
  const byReservation = groupBy(versions, (e) => e.reservation_id);
  // Все брони: с годными версиями и те, у которых были только конфликтные события.
  const reservationIds = [...new Set([...byReservation.keys(), ...conflicted])].sort(compareStrings);
  const reservations: ReservationDecision[] = [];
  for (const reservation_id of reservationIds) {
    const { decision, codes } = decideReservation(
      reservation_id,
      byReservation.get(reservation_id) ?? [],
      conflicted.has(reservation_id),
      properties,
      input.commission_rules,
    );
    reservations.push(decision);
    // Считаются и у брони на hold: старые версии вытеснены, даже если новую не приняли.
    dedup.superseded_reservation_versions += decision.superseded.length;
    for (const code of codes) exceptions.push(exception("reservation", reservation_id, code));
  }

  // 3. Платежи: точные копии учитываются один раз (ТЗ 11), затем каждый платёж уходит ровно в одну корзину.
  const decided = new Map(reservations.map((r) => [r.reservation_id, r]));
  const payments: PaymentDecision[] = [];
  const paymentGroups = [...groupBy(input.payments, (p) => p.payment_id)].sort(([a], [b]) => compareStrings(a, b));
  for (const [payment_id, copies] of paymentGroups) {
    if (distinctContents(copies, "payment_id") > 1) {
      exceptions.push(exception("payment", payment_id, "CONFLICTING_PAYMENT"));
      continue; // ни в одну корзину: какую из сумм брать, неизвестно
    }
    dedup.payment_duplicates += copies.length - 1;
    const { decision, code } = decidePayment(copies[0]!, decided);
    payments.push(decision);
    if (code !== null) exceptions.push(exception("payment", payment_id, code));
  }

  return { reservations, payments, dedup, exceptions };
}
