#!/usr/bin/env node
// Разбор reservations.csv: импорт, проверка строк, поиск пересечений проживаний.
//
//   node scripts/reservation-conflicts.mjs [reservations.csv] [опции]
//
//   --properties <file>   справочник вилл (по умолчанию properties.csv рядом с файлом броней)
//   --property <V013>     показать только одну виллу
//   --summary             только сводка, без групп и таймлайнов
//   --include-cancelled   учитывать отменённые брони как занятые
//   --json <file>         записать результат в JSON
//   --no-color            без ANSI-цветов (также NO_COLOR=1)
//
// Интервал проживания — полуоткрытый [check_in, check_out): ночь check_out не занята,
// поэтому выезд и заезд в один день — не пересечение (они выводятся отдельно как "стыки").

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    properties: { type: 'string' },
    property: { type: 'string' },
    summary: { type: 'boolean', default: false },
    'include-cancelled': { type: 'boolean', default: false },
    json: { type: 'string' },
    'no-color': { type: 'boolean', default: false },
  },
});

const FILE = resolve(positionals[0] ?? 'Technical_Challenge_Data/reservations.csv');
const PROPS_FILE = resolve(opt.properties ?? join(dirname(FILE), 'properties.csv'));

// ───────────────────────────── вывод ─────────────────────────────

const COLOR =
  !opt['no-color'] && !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);
const paint = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  bold: paint(1), dim: paint(2), red: paint(31), green: paint(32), yellow: paint(33),
  blue: paint(34), magenta: paint(35), cyan: paint(36), gray: paint(90), redBold: paint('1;31'),
};
const visLen = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '').length;
const padR = (s, n) => String(s) + ' '.repeat(Math.max(0, n - visLen(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - visLen(s))) + String(s);
const out = (...lines) => console.log(lines.join('\n'));
const WIDTH = 96;

function section(title) {
  out('', c.bold(c.blue('━'.repeat(WIDTH))), c.bold(c.blue(` ${title}`)), c.bold(c.blue('━'.repeat(WIDTH))));
}

function table(headers, rows, align = []) {
  const w = headers.map((h, i) => Math.max(visLen(h), ...rows.map((r) => visLen(r[i]))));
  const cell = (v, i) => (align[i] === 'r' ? padL(v, w[i]) : padR(v, w[i]));
  out(
    '  ' + headers.map((h, i) => c.bold(cell(h, i))).join('  '),
    '  ' + w.map((n) => c.gray('─'.repeat(n))).join('  '),
    ...rows.map((r) => '  ' + r.map(cell).join('  ')),
  );
}

const mln = (n) => (n / 1e6).toFixed(1) + 'M';
const pct = (x) => Math.round(x * 100) + '%';
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${w}`;
};
const nightsW = (n) => plural(n, 'ночь', 'ночи', 'ночей');

// ───────────────────────────── даты ─────────────────────────────

const DAY = 86_400_000;
const toDay = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const t = Date.parse(iso + 'T00:00:00Z');
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso ? null : t / DAY;
};
const iso = (d) => new Date(d * DAY).toISOString().slice(0, 10);
const md = (d) => iso(d).slice(5);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ───────────────────────────── CSV ─────────────────────────────

function readCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split(',');
    const row = { _line: i + 1, _raw: lines[i], _cells: cells.length };
    header.forEach((h, k) => (row[h] = (cells[k] ?? '').trim()));
    rows.push(row);
  }
  return { header, rows };
}

// ───────────────────────────── импорт и проверки строк ─────────────────────────────

const ISSUE = {
  BAD_COLUMNS: { level: 'block', text: 'неверное число колонок' },
  BAD_DATE: { level: 'block', text: 'некорректная дата' },
  BAD_RANGE: { level: 'block', text: 'check_out не позже check_in' },
  BAD_NUMBER: { level: 'block', text: 'сумма не число' },
  UNKNOWN_PROPERTY: { level: 'block', text: 'виллы нет в справочнике' },
  CURRENCY_MISMATCH: { level: 'block', text: 'валюта не совпадает с валютой виллы' },
  REFUND_GT_GROSS: { level: 'block', text: 'возврат больше стоимости брони' },
  NEGATIVE_OTA: { level: 'warn', text: 'отрицательная комиссия OTA' },
  UNKNOWN_STATUS: { level: 'warn', text: 'неизвестный статус' },
  DUP_EXACT: { level: 'dup', text: 'полный дубль строки' },
  DUP_CONFLICT: { level: 'dup', text: 'тот же ID с другими данными' },
};
const STATUSES = new Set(['confirmed', 'modified', 'cancelled']);

const { header, rows } = readCsv(FILE);
const properties = existsSync(PROPS_FILE)
  ? new Map(readCsv(PROPS_FILE).rows.map((p) => [p.property_id, p]))
  : null;

const issues = []; // { line, id, code, detail }
const flag = (row, code, detail = '') => {
  issues.push({ line: row._line, id: row.reservation_id, code, detail });
  (row._issues ??= []).push(code);
};

for (const r of rows) {
  if (r._cells !== header.length) flag(r, 'BAD_COLUMNS', `${r._cells} вместо ${header.length}`);
  r.in = toDay(r.check_in);
  r.out = toDay(r.check_out);
  if (r.in == null) flag(r, 'BAD_DATE', `check_in="${r.check_in}"`);
  if (r.out == null) flag(r, 'BAD_DATE', `check_out="${r.check_out}"`);
  if (r.in != null && r.out != null && r.out <= r.in) flag(r, 'BAD_RANGE', `${r.check_in} → ${r.check_out}`);
  r.nights = r.in != null && r.out != null ? r.out - r.in : 0;
  for (const f of ['gross_booking_value', 'ota_fee', 'refund_amount']) {
    if (!/^-?\d+(\.\d+)?$/.test(r[f])) flag(r, 'BAD_NUMBER', `${f}="${r[f]}"`);
  }
  r.gbv = Number(r.gross_booking_value);
  r.ota = Number(r.ota_fee);
  r.refund = Number(r.refund_amount);
  if (!STATUSES.has(r.status)) flag(r, 'UNKNOWN_STATUS', `"${r.status}"`);
  if (properties) {
    const p = properties.get(r.property_id);
    if (!p) flag(r, 'UNKNOWN_PROPERTY', r.property_id);
    else if (p.base_currency !== r.currency) flag(r, 'CURRENCY_MISMATCH', `${r.currency}, у виллы ${p.base_currency}`);
  }
  if (r.refund > r.gbv) flag(r, 'REFUND_GT_GROSS', `${mln(r.refund)} > ${mln(r.gbv)}`);
  if (r.ota < 0) flag(r, 'NEGATIVE_OTA', String(r.ota));
}

// Дубли по reservation_id: полный дубль отбрасываем, при расхождении оставляем свежий updated_at.
const byId = new Map();
for (const r of rows) {
  const prev = byId.get(r.reservation_id);
  if (!prev) { byId.set(r.reservation_id, r); continue; }
  if (prev._raw === r._raw) { flag(r, 'DUP_EXACT', `повтор строки ${prev._line}`); r._dropped = true; continue; }
  const [keep, drop] = r.updated_at > prev.updated_at ? [r, prev] : [prev, r];
  flag(drop, 'DUP_CONFLICT', `оставлена строка ${keep._line} (updated_at ${keep.updated_at})`);
  drop._dropped = true;
  byId.set(r.reservation_id, keep);
}

const isBlocked = (r) => (r._issues ?? []).some((k) => ISSUE[k].level === 'block');
const hasRange = (r) => !(r._issues ?? []).some((k) => k === 'BAD_DATE' || k === 'BAD_RANGE');
const unique = [...byId.values()];
const occupying = (r) => opt['include-cancelled'] || r.status !== 'cancelled';
const scopeAll = unique.filter((r) => occupying(r) && hasRange(r));
const scopeClean = scopeAll.filter((r) => !isBlocked(r));

// ───────────────────────────── пересечения ─────────────────────────────

function kindOf(a, b) {
  if (a.in === b.in && a.out === b.out) return 'same_dates';
  if (a.status === 'modified' || b.status === 'modified') return 'modified_version';
  if ((a.in <= b.in && a.out >= b.out) || (b.in <= a.in && b.out >= a.out)) return 'nested';
  return 'partial';
}
const KIND = {
  same_dates: { label: 'те же даты', color: c.redBold, hint: 'вероятный дубль брони' },
  modified_version: { label: 'modified', color: c.magenta, hint: 'вероятно новая версия брони без ссылки на исходную' },
  nested: { label: 'вложенная', color: c.red, hint: 'одна бронь целиком внутри другой' },
  partial: { label: 'частичная', color: c.yellow, hint: 'брони заходят друг на друга краями' },
};
const depthLabel = (share) =>
  share >= 1 ? c.redBold('ПОЛНОЕ') : share >= 0.5 ? c.red('СИЛЬНОЕ') : c.yellow('ЧАСТИЧНОЕ');

function analyze(recs) {
  const byProp = new Map();
  for (const r of recs) (byProp.get(r.property_id) ?? byProp.set(r.property_id, []).get(r.property_id)).push(r);

  const pairs = [];
  const touches = [];
  for (const list of byProp.values()) {
    list.sort((a, b) => a.in - b.in || a.out - b.out || a.reservation_id.localeCompare(b.reservation_id));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (b.in > a.out) break;
        if (b.in === a.out) { touches.push([a, b]); continue; }
        const from = Math.max(a.in, b.in), to = Math.min(a.out, b.out);
        const nights = to - from;
        pairs.push({ a, b, from, to, nights, share: nights / Math.min(a.nights, b.nights), kind: kindOf(a, b) });
      }
    }
  }

  // Группы — компоненты связности графа пересечений (A×B и B×C → одна группа A,B,C).
  const parent = new Map();
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  for (const p of pairs) for (const r of [p.a, p.b]) if (!parent.has(r)) parent.set(r, r);
  for (const p of pairs) parent.set(find(p.a), find(p.b));

  const comp = new Map();
  for (const r of parent.keys()) (comp.get(find(r)) ?? comp.set(find(r), []).get(find(r))).push(r);

  const groups = [...comp.values()].map((members) => {
    members.sort((a, b) => a.in - b.in || a.out - b.out);
    const start = Math.min(...members.map((r) => r.in));
    const end = Math.max(...members.map((r) => r.out));
    const depth = Array.from({ length: end - start }, (_, k) =>
      members.filter((r) => r.in <= start + k && start + k < r.out).length);
    // Сколько броней минимум придётся снять, чтобы остальные не пересекались:
    // n − максимальное число непересекающихся (жадно по раннему выезду). Это нижняя граница, не решение.
    let kept = 0, lastOut = -Infinity;
    for (const r of [...members].sort((a, b) => a.out - b.out)) if (r.in >= lastOut) { kept++; lastOut = r.out; }
    const ids = new Set(members);
    return {
      property: members[0].property_id, members, start, end, depth,
      maxDepth: Math.max(...depth),
      conflictNights: depth.filter((d) => d >= 2).length,
      minDrop: members.length - kept,
      pairs: pairs.filter((p) => ids.has(p.a)),
    };
  });
  groups.sort((g, h) => g.property.localeCompare(h.property) || g.start - h.start);
  groups.forEach((g, i) => (g.no = 'G' + String(i + 1).padStart(2, '0')));

  return { byProp, pairs, touches, groups };
}

const all = analyze(scopeAll);
const clean = analyze(scopeClean);

// ───────────────────────────── 1. импорт ─────────────────────────────

out(
  c.bold(`Конфликты броней · ${relative(process.cwd(), FILE)}`),
  c.gray(
    `интервал [check_in, check_out) · справочник вилл: ${properties ? relative(process.cwd(), PROPS_FILE) : 'нет'}` +
      (opt['include-cancelled'] ? ' · отмены учитываются' : ' · отмены не занимают виллу'),
  ),
);

section('1. ИМПОРТ');
const statusCount = (list) =>
  [...list.reduce((m, r) => m.set(r.status, (m.get(r.status) ?? 0) + 1), new Map())]
    .map(([s, n]) => `${s} ${n}`).join(', ');
out(
  `  строк в файле:        ${c.bold(rows.length)}  (колонки: ${header.join(', ')})`,
  `  уникальных броней:    ${c.bold(unique.length)}  ${c.gray(statusCount(unique))}`,
  `  дублей отброшено:     ${c.bold(rows.filter((r) => r._dropped).length)}`,
);

if (issues.length) {
  out('', c.bold('  Проблемы в строках'));
  const lvl = { block: c.red('блок'), warn: c.yellow('пред'), dup: c.cyan('дубль') };
  table(
    ['стр', 'бронь', 'вилла', 'уровень', 'проблема', 'детали'],
    issues.map((i) => {
      const r = rows.find((x) => x._line === i.line);
      return [String(i.line), i.id, r.property_id, lvl[ISSUE[i.code].level], ISSUE[i.code].text, c.gray(i.detail)];
    }),
    ['r'],
  );
  out(
    '',
    c.gray('  блок  — запись не годится для расчётов, в "чистой" области исключается'),
    c.gray('  пред  — запись остаётся, но требует проверки'),
  );
}

out(
  '',
  `  в анализе занятости:  ${c.bold(scopeAll.length)} броней ` +
    c.gray(`(без отмен${unique.length - scopeAll.length > 0 ? `: −${unique.length - scopeAll.length}` : ''})`),
  `  из них чистых:        ${c.bold(scopeClean.length)} ` +
    c.gray(`(без блокирующих проблем: −${scopeAll.length - scopeClean.length} ` +
      scopeAll.filter(isBlocked).map((r) => r.reservation_id).join(', ') + ')'),
);

// ───────────────────────────── 2. группы конфликтов ─────────────────────────────

const flagMark = (r) => (isBlocked(r) ? c.red('⚑') : r._issues?.length ? c.yellow('!') : ' ');
const statusColor = (r) => (r.status === 'modified' ? c.magenta : r.status === 'cancelled' ? c.gray : c.cyan);
const STATUS_SHORT = { confirmed: 'conf', modified: 'mod ', cancelled: 'canc' };

function renderTimeline(g) {
  const from = g.start - 1, to = g.end + 1;
  const days = Array.from({ length: to - from }, (_, k) => from + k);
  const dom = (d) => new Date(d * DAY).getUTCDate();
  const LBL = 16;
  let monthRow = '';
  days.forEach((d, k) => {
    if (k === 0 || dom(d) === 1) {
      const m = MONTHS[new Date(d * DAY).getUTCMonth()];
      monthRow = padR(monthRow, k) + (monthRow.length > k ? '' : m);
    }
  });
  const lines = [
    ' '.repeat(LBL) + c.gray(monthRow.slice(0, days.length)),
    ' '.repeat(LBL) + c.gray(days.map((d) => (dom(d) >= 10 ? String(dom(d))[0] : ' ')).join('')),
    ' '.repeat(LBL) + c.gray(days.map((d) => String(dom(d) % 10)).join('')),
  ];
  for (const r of g.members) {
    const cells = days.map((d) => {
      if (!(r.in <= d && d < r.out)) return c.gray('·');
      return g.depth[d - g.start] >= 2 ? c.red('█') : statusColor(r)('█');
    });
    lines.push(padR(`  ${flagMark(r)}${r.reservation_id} ${statusColor(r)(STATUS_SHORT[r.status] ?? r.status)}`, LBL) + cells.join(''));
  }
  const depthCell = (n) =>
    n === 0 ? c.gray('·') : n === 1 ? c.green('1') : n === 2 ? c.yellow('2') : c.redBold(String(n));
  lines.push(padR(c.gray('   глубина'), LBL) + days.map((d) => depthCell(g.depth[d - g.start] ?? 0)).join(''));
  out(...lines);
}

function renderGroup(g) {
  const head =
    `${c.bold(g.no)}  ${c.bold(g.property)}  ${iso(g.start)} → ${iso(g.end)}  ` +
    `${plural(g.members.length, 'бронь', 'брони', 'броней')}, ${plural(g.pairs.length, 'пара', 'пары', 'пар')}  ` +
    `глубина ${g.maxDepth >= 3 ? c.redBold(g.maxDepth) : c.yellow(g.maxDepth)}  ` +
    `двойных ${nightsW(g.conflictNights)}  снять минимум ${c.bold(g.minDrop)}`;
  out('', head);
  table(
    ['', 'бронь', 'заезд', 'выезд', 'ноч', 'статус', 'канал', 'GBV', 'updated', 'проблемы'],
    g.members.map((r) => [
      flagMark(r), r.reservation_id, r.check_in, r.check_out, String(r.nights), statusColor(r)(r.status),
      r.channel, `${mln(r.gbv)} ${r.currency}`, r.updated_at,
      c.gray((r._issues ?? []).filter((k) => ISSUE[k].level !== 'dup').map((k) => ISSUE[k].text).join('; ')),
    ]),
    [, , , , 'r', , , 'r'],
  );
  out('');
  renderTimeline(g);
  out('');
  for (const p of g.pairs.sort((x, y) => y.share - x.share || y.nights - x.nights)) {
    const k = KIND[p.kind];
    out(
      `    ${c.red('✕')} ${p.a.reservation_id} × ${p.b.reservation_id}  ` +
        `${padR(depthLabel(p.share), 9)}  ${padR(nightsW(p.nights), 7)} ${c.gray(`${md(p.from)}→${md(p.to)}`)}  ` +
        `${padL(pct(p.share), 4)} короткой  ${k.color(k.label)}`,
    );
  }
}

const shown = all.groups.filter((g) => !opt.property || g.property === opt.property);
if (!opt.summary) {
  section(`2. ГРУППЫ КОНФЛИКТОВ (${shown.length})`);
  out(
    c.gray('  Группа — брони одной виллы, связанные цепочкой пересечений. Глубина — сколько броней'),
    c.gray('  претендуют на одну ночь. "Снять минимум" — сколько броней группы нужно убрать, чтобы'),
    c.gray('  остальные не пересекались (нижняя граница по числу, а не выбор какие).'),
    c.gray(`  Таймлайн: колонка = ночь, ${c.red('█')} ночь с двойной бронью, ⚑ блокирующая проблема, ! предупреждение.`),
  );
  let lastProp = null;
  for (const g of shown) {
    if (g.property !== lastProp) {
      const total = all.byProp.get(g.property).length;
      const inConf = shown.filter((x) => x.property === g.property).reduce((s, x) => s + x.members.length, 0);
      const p = properties?.get(g.property);
      out('', c.bold(c.cyan(`▌ ${g.property}${p ? ` · ${p.property_name} · ${p.cluster}` : ' · нет в справочнике'}`)) +
        c.gray(`   ${inConf} из ${total} броней в конфликте`));
      lastProp = g.property;
    }
    renderGroup(g);
  }
}

// ───────────────────────────── 3. modified ─────────────────────────────

const modified = unique.filter((r) => r.status === 'modified' && (!opt.property || r.property_id === opt.property));
if (!opt.summary && modified.length) {
  section(`3. БРОНИ "modified" (${modified.length})`);
  out(
    c.gray('  В файле нет ссылки на исходную бронь. Кандидаты — брони той же виллы с близкими датами'),
    c.gray('  (сдвиг заезда+выезда ≤ 7 дней); Δ GBV — разница сумм. Склеивать автоматически нельзя.'),
  );
  for (const m of modified) {
    const cands = unique
      .filter((r) => r !== m && r.property_id === m.property_id && hasRange(r))
      .map((r) => ({ r, shift: Math.abs(r.in - m.in) + Math.abs(r.out - m.out), dGbv: Math.abs(r.gbv - m.gbv) / Math.max(r.gbv, m.gbv) }))
      .filter((x) => x.shift <= 7)
      .sort((x, y) => x.shift - y.shift || x.dGbv - y.dGbv);
    out('', `  ${c.magenta(m.reservation_id)} ${m.property_id}  ${m.check_in} → ${m.check_out}  ${mln(m.gbv)}  updated ${m.updated_at}`);
    if (!cands.length) out(c.gray('      кандидатов нет'));
    for (const { r, shift, dGbv } of cands.slice(0, 4)) {
      const ov = Math.max(0, Math.min(r.out, m.out) - Math.max(r.in, m.in));
      out(
        `      ${r.reservation_id} ${statusColor(r)(padR(r.status, 9))} ${r.check_in} → ${r.check_out}  ` +
          `сдвиг ${padL(shift, 2)} дн  Δ GBV ${padL(pct(dGbv), 4)}  ` +
          (ov ? c.red(`пересечение ${nightsW(ov)}`) : c.green('не пересекается')),
      );
    }
  }
}

// ───────────────────────────── 4. сводка ─────────────────────────────

section('4. СВОДКА');

function stats(a, scope) {
  const involved = new Set(a.pairs.flatMap((p) => [p.a, p.b]));
  const idr = (list) => list.filter((r) => r.currency === 'IDR').reduce((s, r) => s + r.gbv, 0);
  return {
    reservations: scope.length,
    involved: involved.size,
    pairs: a.pairs.length,
    groups: a.groups.length,
    properties: new Set(a.groups.map((g) => g.property)).size,
    conflictNights: a.groups.reduce((s, g) => s + g.conflictNights, 0),
    overlapNights: a.pairs.reduce((s, p) => s + p.nights, 0),
    minDrop: a.groups.reduce((s, g) => s + g.minDrop, 0),
    maxDepth: Math.max(0, ...a.groups.map((g) => g.maxDepth)),
    touches: a.touches.length,
    gbvInvolved: idr([...involved]),
    gbvTotal: idr(scope),
  };
}
const sAll = stats(all, scopeAll);
const sClean = stats(clean, scopeClean);
const both = (f) => [f(sAll), f(sClean)];
table(
  ['показатель', 'все активные', 'чистые'],
  [
    ['броней в области', ...both((s) => String(s.reservations))],
    ['броней в конфликте', ...both((s) => `${s.involved} (${pct(s.involved / s.reservations)})`)],
    ['пар пересечений', ...both((s) => c.bold(s.pairs))],
    ['групп', ...both((s) => String(s.groups))],
    ['вилл с конфликтами', ...both((s) => String(s.properties))],
    ['макс. глубина', ...both((s) => String(s.maxDepth))],
    ['ночей с двойной бронью', ...both((s) => String(s.conflictNights))],
    ['ночей пересечения по парам', ...both((s) => String(s.overlapNights))],
    ['снять минимум броней', ...both((s) => String(s.minDrop))],
    ['GBV в конфликте, IDR', ...both((s) => `${mln(s.gbvInvolved)} из ${mln(s.gbvTotal)} (${pct(s.gbvInvolved / s.gbvTotal)})`)],
    ['стыков (выезд = заезд)', ...both((s) => c.gray(s.touches + ' — не конфликт'))],
  ],
  [, 'r', 'r'],
);

out('', c.bold('  Вид пересечения') + c.gray('  (все активные)'));
const maxBar = Math.max(1, ...Object.keys(KIND).map((k) => all.pairs.filter((p) => p.kind === k).length));
for (const [k, v] of Object.entries(KIND)) {
  const n = all.pairs.filter((p) => p.kind === k).length;
  out(`  ${padR(v.color(v.label), 12)} ${padL(n, 3)}  ${v.color('■'.repeat(Math.round((n / maxBar) * 40)))}  ${c.gray(v.hint)}`);
}

out('', c.bold('  Глубина пары') + c.gray('  (доля короткой брони, которую съедает пересечение)'));
const buckets = [
  ['100%', (p) => p.share >= 1, c.redBold],
  ['50–99%', (p) => p.share >= 0.5 && p.share < 1, c.red],
  ['< 50%', (p) => p.share < 0.5, c.yellow],
];
for (const [label, test, color] of buckets) {
  const n = all.pairs.filter(test).length;
  out(`  ${padR(label, 12)} ${padL(n, 3)}  ${color('■'.repeat(Math.round((n / maxBar) * 40)))}`);
}

out('', c.bold('  Ночей пересечения в паре'));
const byNights = new Map();
for (const p of all.pairs) byNights.set(p.nights, (byNights.get(p.nights) ?? 0) + 1);
for (const [n, k] of [...byNights].sort((x, y) => x[0] - y[0])) {
  out(`  ${padR(nightsW(n), 12)} ${padL(k, 3)}  ${c.cyan('■'.repeat(Math.round((k / maxBar) * 40)))}`);
}

out('', c.bold('  По виллам') + c.gray('  (все активные, сортировка по тяжести)'));
const propRows = [...all.byProp.keys()]
  .map((pid) => {
    const gs = all.groups.filter((g) => g.property === pid);
    return {
      pid, total: all.byProp.get(pid).length, gs,
      involved: gs.reduce((s, g) => s + g.members.length, 0),
      pairs: gs.reduce((s, g) => s + g.pairs.length, 0),
      maxDepth: Math.max(0, ...gs.map((g) => g.maxDepth)),
      conflictNights: gs.reduce((s, g) => s + g.conflictNights, 0),
      minDrop: gs.reduce((s, g) => s + g.minDrop, 0),
    };
  })
  .sort((a, b) => b.maxDepth - a.maxDepth || b.conflictNights - a.conflictNights || a.pid.localeCompare(b.pid));
table(
  ['вилла', 'броней', 'в конфл.', 'пар', 'групп', 'глубина', 'двойн. ночей', 'снять', 'группы'],
  propRows.map((p) => [
    p.pid, String(p.total), String(p.involved), String(p.pairs), String(p.gs.length),
    p.maxDepth >= 3 ? c.redBold(p.maxDepth) : p.maxDepth === 2 ? c.yellow(p.maxDepth) : c.green('—'),
    String(p.conflictNights), String(p.minDrop), c.gray(p.gs.map((g) => g.no).join(' ')),
  ]),
  [, 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
);

const worst = [...all.groups].sort((a, b) => b.maxDepth - a.maxDepth || b.conflictNights - a.conflictNights).slice(0, 5);
out('', c.bold('  Самые тяжёлые группы'));
for (const g of worst) {
  out(
    `  ${g.no} ${g.property}  ${md(g.start)}→${md(g.end)}  глубина ${c.redBold(g.maxDepth)}  ` +
      `двойных ${nightsW(g.conflictNights)}  ${g.members.map((r) => r.reservation_id).join(' ')}`,
  );
}

const onlyInAll = all.pairs.filter((p) => isBlocked(p.a) || isBlocked(p.b));
if (onlyInAll.length) {
  out('', c.bold('  Пары, которые уходят в чистой области') + c.gray('  (одна из броней с блокирующей проблемой)'));
  for (const p of onlyInAll) {
    const bad = [p.a, p.b].filter(isBlocked).map((r) => `${r.reservation_id}: ${r._issues.map((k) => ISSUE[k].text).join('; ')}`);
    out(`  ${p.a.reservation_id} × ${p.b.reservation_id}  ${c.gray(bad.join(' | '))}`);
  }
}
out('');

// ───────────────────────────── JSON ─────────────────────────────

if (opt.json) {
  const ref = (r) => r.reservation_id;
  const dumpScope = (a, s) => ({
    stats: s,
    pairs: a.pairs.map((p) => ({
      a: ref(p.a), b: ref(p.b), property: p.a.property_id, from: iso(p.from), to: iso(p.to),
      nights: p.nights, shareOfShorter: +p.share.toFixed(3), kind: p.kind,
    })),
    groups: a.groups.map((g) => ({
      no: g.no, property: g.property, from: iso(g.start), to: iso(g.end), members: g.members.map(ref),
      maxDepth: g.maxDepth, conflictNights: g.conflictNights, minDrop: g.minDrop,
    })),
    touches: a.touches.map(([x, y]) => [ref(x), ref(y)]),
  });
  writeFileSync(
    opt.json,
    JSON.stringify({ file: relative(process.cwd(), FILE), rows: rows.length, issues,
      scopes: { all: dumpScope(all, sAll), clean: dumpScope(clean, sClean) } }, null, 2),
  );
  out(c.gray(`  JSON: ${opt.json}`));
}
