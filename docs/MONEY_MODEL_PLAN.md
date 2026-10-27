# План: денежная модель финального задания в коде (фаза 6b)

Статус: v1 от 2026-10-27, не начат. Детализирует фазу 6b из [ROADMAP.md](ROADMAP.md): порядок шагов, файлы, контрольные числа, ловушки. Что считаем — [PLAN.md](PLAN.md) 7 (отличия от старой модели — 7.8); как считает модуль — [CALCULATION_MODULE.md](CALCULATION_MODULE.md) v2; правила — [VALIDATION_PLAN.md](VALIDATION_PLAN.md) v6; как то же сделано в адаптере — [FINAL_TEST_PLAN.md](FINAL_TEST_PLAN.md) 3. Если этот план и спецификации расходятся по содержанию, действует спецификация; по порядку — этот план.

**Как работать по плану.** Шаги идут строго по порядку: каждый следующий стоит на предыдущем. Шаг заканчивается зелёными проверками (раздел 6), записью факта времени в раздел 8 и диффом на просмотр: коммитит автор, план шага — не разрешение на коммит. Перед шагом 7 (страницы) — прочитать нужный раздел `node_modules/next/dist/docs/` (AGENTS.md). Вопросы, которые не решены в разделе 2, не решаются молча: либо автор отвечает, либо действует значение по умолчанию из раздела 2.

## 1. Цель

Код считает по модели PLAN.md 7, а не по модели первого задания. Сейчас эта модель есть только в адаптере `lib/nightly`; ядро `lib/calc`, правила `lib/dq`, адаптер данных `lib/data` и страницы считают по-старому.

Что меняется:

| | Сейчас (v1) | После фазы |
|---|---|---|
| Ставка комиссии | на дату заезда (`reservation.ts`: `resolveCommissionRule(…, r.checkIn)`) | на каждую ночь |
| Округление комиссии | одно на бронь (`calculateManagementFee`), затем `allocate` по ночам | по каждой ночи, комиссия брони — сумма ночных |
| PBJT | нет | отдельная сумма брони, начисление «PBJT к уплате», в ожидаемом платеже |
| Платёж | без статуса | `received` / `pending`; три вида денег: поступило, удержано, не привязано |
| Оценка собственника | owner balance | owner estimate (до расходов) и owner balance |
| Версии брони | DQ-02: любая вторая версия — `decide` | последняя по `updated_at` сама, прежние `superseded` |
| Нет ставки | DQ-17 `review`, расчёт падает в отказы | DQ-17 `exclude` на любую ночь без правила |
| `lib/nightly` | свой расчёт ночей (`fees.ts`) | расчёт через ядро, вывод тот же байт в байт |

Что на данных первого задания (CSV) **не меняется**: ставка внутри проживания нигде не меняется (одно правило на виллу), PBJT нет (0), все 76 платежей `received`, DQ-02 и DQ-17 не находят ничего. Сдвигается только комиссия от округления по ночам: −19 IDR по всему набору, у 96 строк броней на 1–3 IDR. Если на CSV поменялось что-то ещё — это ошибка шага, а не модель.

## 2. Решить до начала

1. **DQ-16 и DQ-23 у броней OTA** (VALIDATION_PLAN.md 12.9, ROADMAP.md 6). По ТЗ финального задания выплата OTA после выезда — обычное дело (R101), а правила считают её долгом и опозданием; у OTA примерно 4 флага из 5. Варианты: (а) не трогать до ответа финдиректора; (б) у броней OTA оба правила дают `skip` с причиной «OTA payout», срок выплаты OTA — отдельным правилом после ответа финдиректора; (в) пропускать у OTA только DQ-23. Рекомендация — (б). **По умолчанию — (а)**, шаг 6 тогда этих правил не касается.
2. **Пересечение правил комиссии на ночи** (PLAN.md 7.7). По умолчанию в системе `commissionRuleOverlap: 'latest-start'` (решение 2026-10-18 остаётся), в CLI финального задания — `ambiguous`. Если автор хочет строгое поведение везде — меняется значение в `DEFAULT_POLICIES`, план не меняется.

Решено без вопросов (PLAN.md 15, 2026-10-27): PBJT в CSV = 0 в расчёте, `null` в базе; канал в ленте событий — `null`, не угадываем.

## 3. Что в коде сейчас

Прочитано 2026-10-27, номера строк могут уйти.

- `lib/calc/commission.ts`: `commissionRulesOn` (фильтр правил на дату), `resolveCommissionRule(rules, propertyId, date)` (позднее правило, при равной дате начала — `AMBIGUOUS_COMMISSION_RULE`), `calculateManagementFee(r, rule, mode)` — `applyRate(r.gross, …)` на всю бронь. Других потребителей `calculateManagementFee`, кроме `reservation.ts` и `index.ts`, нет.
- `lib/calc/reservation.ts`: `calculateReservation` берёт правило на `r.checkIn`, считает комиссию один раз, `spreadOverNights` делит gross, refund, otaFee и комиссию через `allocate`. `calculateExpectedPayout = GBV − OTA − REF`.
- `lib/calc/types.ts`: `ReservationCalc.rate: Rate | null`, `NightLine` без ставки и PBJT, `PaymentInput` без статуса, `Accruals.otaFeeByChannel: Record<Channel, Money>`, `CashFlow { received, paidExpenses, netCashFlow }`.
- `lib/calc/breakdown.ts` (`itemize`, источник подписей «17 % of gross» в `components/dashboard/figure-sources.tsx:82`): `StayPart.rate = c.rate` с инвариантом «есть строки ночей — есть ставка». **В спецификациях этого места нет.**
- `lib/calc/owner-balance.ts`: `OWNER_BALANCE_GAPS` с `ota_fee_bearer`; `estimateOwnerBalance = netRental − MF − opex`.
- `lib/calc/policies.ts`: `CalcPolicies` и `ALLOWED` — проверка значений во время выполнения.
- `lib/dq/checks/dq02-conflicting-versions.ts`: v1, `decide` на любую вторую живую версию, `updated_at` пишется в `details`.
- `lib/dq/checks/dq05-payment-reservation-valid.ts`: причины в `details.problem` **уже есть**: `missing` (брони нет), `reservation_excluded`, `hold` с `reservation_versions` и `reservation_pending`. Поиск брони — `reservationLookup` в `checks/common.ts`: «живые» строки — не `duplicate` и не `excluded`.
- `lib/dq/checks/common.ts`: `isOutUnit` — строка `duplicate` или `excluded`, остальные правила её пропускают (`SKIP.out`).
- `lib/dq/checks/dq17-commission-rule-covers.ts`: v1, `review`, правило на дату заезда и `rate_changes`, если ставка ночи другая. `eachNight` уже есть.
- `lib/dq/verdict.ts`: приоритет 0 — вытесненная строка `pending` (`supersededVerdict`, без правил), 1 — `duplicate`, дальше `excluded` и т. д.
- `lib/data/admit.ts`: строки + вердикты → входы `lib/calc`; неизвестная валюта — отказ адаптера `UNKNOWN_CURRENCY`.
- `lib/data/reconciliation.ts`, `components/reconciliation/reconciliation-view.tsx`, `components/dashboard/outside-figures.tsx`, `app/import/reconciliation/page.tsx`: «unallocated» — все исключённые платежи одним списком.
- `lib/nightly/fees.ts`: на каждую ночь ровно одно правило, иначе собирает **оба** кода (`NO_COMMISSION_RULE`, `AMBIGUOUS_COMMISSION_RULE`) по всем ночам в их порядке; затем `allocate` трёх сумм и `applyRate(…, rateFromBps(bps), 'half-up')` на ночь.
- Схема: `payment_status_known` — только `received`; `dq_check_result_action_known` без `supersede`; `dq_record_verdict` — у `superseded` правил быть не может; `pbjt` нигде нет; `app.eff_reservation` берёт строку по слою.

## 4. Шаги

### Шаг 0. Исходная точка — 10 мин

- Дерево чистое (`git status`).
- Прогнать проверки раздела 6 и записать, что красное до начала. На 2026-10-23 `npm run test:lib` проваливал порог ветвей на `lib/data/csv-source.ts:40` — давнее, к фазе не относится; если так и осталось, не чинить молча, а записать.
- Сохранить в scratchpad вывод `npm run dq` и итоги дашборда по CSV (весь период, сентябрь, октябрь) — для сравнения после шагов 3 и 7.

### Шаг 1. Политика пересечения правил — 10 мин

Файлы: `lib/calc/policies.ts`, `lib/calc/commission.ts`, их тесты; вызовы `resolveCommissionRule` в `lib/dq/checks/dq17-*`, `dq22-*`.

- `CalcPolicies.commissionRuleOverlap: 'latest-start' | 'ambiguous'`, в `DEFAULT_POLICIES` — `latest-start`, в `ALLOWED` — оба.
- `resolveCommissionRule(rules, propertyId, date, overlap)`: при `ambiguous` любые два правила на дату → `AMBIGUOUS_COMMISSION_RULE`; при `latest-start` — как сейчас. DQ-17 и DQ-22 передают `ctx.policies.commissionRuleOverlap`.
- Тесты: CALCULATION_MODULE.md 10.3, первые пункты (обе политики, порядок правил не важен).

Числа не меняются.

### Шаг 2. Новые поля входа — 20 мин

Файлы: `lib/calc/types.ts`, `lib/calc/testing/fixtures.ts`, `arbitraries.ts`, `lib/data/admit.ts`, тесты по ошибкам компиляции.

- `ReservationInput.pbjt: Money`; `PaymentInput.status: 'received' | 'pending'`; `Channel | null` у брони и `ReservationCalc`. `Accruals.otaFeeByChannel` получает третий ключ `unknown` (сумма трёх = `otaFee`), на дашборде он показывается только ненулевым.
- `calculateReservation` сверяет валюту PBJT, как остальных сумм.
- `admit.ts`: `pbjt` = 0 в валюте брони (в CSV поля нет — не придумывать колонку); `status` платежа из строки; статус не из `received | pending` — отказ адаптера `UNKNOWN_STATUS` (до шага 6 таких строк быть не может: в CSV все `received`).
- Генераторы fast-check дают PBJT и оба статуса.

Числа не меняются: PBJT ещё нигде не суммируется, статус ещё не читается.

### Шаг 3. Ставка и округление по ночам — 40 мин

Главный шаг: здесь меняются числа.

Файлы: `lib/calc/commission.ts`, `reservation.ts`, `types.ts`, `breakdown.ts`, `index.ts`, `view.ts` (проверить), их тесты, `golden.test.ts`, `properties.test.ts`; `lib/data/golden.test.ts`; `components/dashboard/figure-sources.tsx`.

- `commission.ts`: `managementFeeForNight(nightGross, rule, mode)` вместо `calculateManagementFee` (`switch (feeBasis)` остаётся); экспорт в `index.ts` заменить.
- `reservation.ts`, ветка `confirmed | modified`: `allocate` для A, PBJT, REF, OTA по отдельности; на каждую ночь `resolveCommissionRule(…, date, policies.commissionRuleOverlap)` и `managementFeeForNight`; ошибка правила на любой ночи — ошибка всей брони. `managementFee` брони = сумма ночных. `checkout`: сначала ночи, потом свёртка в одну строку с датой выезда (`rate: null`, комиссия — сумма ночных).
- `NightLine.rate: Rate | null`, `NightLine.pbjt`; `ReservationCalc.rates: Rate[]` (разные ставки ночей по порядку) вместо `rate`; у отмены `[]`.
- `breakdown.ts`: `StayPart.rates` — разные ставки ночей **внутри периода**; инвариант «есть ночи — есть ставки». `figure-sources.tsx`: «17 % of gross» → список ставок через « / ».
- `view.ts`: `View<T>` должен пропускать массив `Rate` (`expectTypeOf`-тест).
- Тесты: перенести из `lib/nightly/fees.test.ts` тест F1 (R101: 374 000 + 440 000, ни 748 000, ни 880 000) и «нечётную сумму» (4 000 004 на 4 ночи по 17 % → 680 000, одним округлением 680 001); обновить R0020, R0102, V011 (раздел 5); свойства CALCULATION_MODULE.md 10.7.
- `lib/data/golden.test.ts`: эталон портфеля сверен независимым пересчётом по сырым CSV без кода `lib/` — **пересчёт тоже перевести на комиссию по ночам**, а не вписать новые числа из кода.

Числа: меняются только Management fees и то, что из них выводится (owner share, owner balance). Всё остальное на CSV — как в шаге 0.

### Шаг 4. Показатели — 20 мин

Файлы: `lib/calc/reservation.ts`, `accrual.ts`, `cash.ts`, `reconciliation.ts`, `owner-balance.ts`, `overview.ts`, `types.ts`, тесты.

- `calculateExpectedPayout = A + PBJT − OTA − REF`; `calculateOwnerShare` — без изменений по формуле (`A − REF − OTA − MF`).
- `Accruals.pbjt`, `Accruals.ownerEstimate` (= `netRental − managementFee`).
- `calculateCashFlow`: `received` — только `status = received`; новое `pending` — сумма `pending` по `payment_date`; `netCashFlow` — от `received`.
- `reconcileReservation`: «получено» — только `received`.
- `OWNER_BALANCE_GAPS` без `ota_fee_bearer`; `estimateOwnerBalance = ownerEstimate − operatingExpenses`; owner estimate тоже с `isEstimate: true`.
- `calculateOverview`, `Headline`: PBJT, owner estimate, `pending`.
- Тесты: синтетика A 1000 / PBJT 100 / OTA 150 → ожидается 950; `pending` не в поступлениях и не в «получено»; P101 финального задания → `matched`.

Числа CSV не меняются (PBJT 0, все `received`); меняется только список недостающих условий.

### Шаг 5. Версии брони: `supersede` и DQ-02 v2 — 30 мин

Файлы: `lib/dq/types.ts`, `verdict.ts`, `checks/common.ts`, `checks/dq02-*`, `cases.ts` (проверить), DQ-90, тесты.

- `Action` += `supersede`. `verdict.ts`: после `duplicate` — `fail` с `supersede` → `superseded` с правилом DQ-02 в `ruleIds` (путь `supersededVerdict` для вытесненной `pending` остаётся без правил).
- `common.ts`: `isOutUnit` — ещё и `superseded`; `reservationLookup` — `superseded` не живая строка. Иначе платёж брони с прежней версией получит `hold` «reservation_versions», а DQ-12 найдёт пересечение брони с собственной старой версией.
- DQ-02 v2, только брони: среди живых версий ключа наибольший `updated_at`; одна строка с ним — `pass`, у остальных — `supersede`; несколько с разным содержимым — `decide` у них (случай `version`), у более старых — `supersede`. В CSV `updated_at` — дата `YYYY-MM-DD`, сравнение строкой корректно. Платежи, расходы, справочники — как в v1. `version` у правила — 2.
- `cases.ts` строит случаи только по `pending`, `superseded` туда не попадает — проверить тестом.
- DQ-90: `superseded` в сумме статусов.
- Тесты: VALIDATION_PLAN.md 9.12, первый пункт (три версии в любом порядке, равный `updated_at`, одинаковое содержимое — DQ-01).

Числа CSV не меняются: DQ-02 на CSV находит 0.

### Шаг 6. Остальные правила — 40 мин

Файлы: `lib/dq/checks/dq17-*`, `dq14-*`, `dq16-*`, `dq24-*`, новый `dq25-payment-status.ts`, `checks/index.ts`, `checks/common.ts`; `components/rules/rule-meta.ts`, `components/data-quality/describe.ts`; тесты и `lib/dq/golden.test.ts`.

- **DQ-17 v2**: `action: 'exclude'`, `version: 2`; на каждую ночь `resolveCommissionRule` с политикой; первая ночь без правила или с неоднозначностью — `fail` с `details { problem: 'no_rule' | 'ambiguous', date }`; `rate_changes` удалить: смена ставки — `pass`. Действие меняется на исключающее — поменять цвет и группу значка в `rule-meta.ts` и текст в `describe.ts`.
- **DQ-05**: вердикты прежние. Проверить, что после шага 5 платёж брони, у которой есть `superseded`-версия, — `pass`, а не `hold`.
- **DQ-14, DQ-16, DQ-24**: ожидаемое `A + PBJT − OTA − REF` — общий помощник в `common.ts` (PBJT из строки, если колонка есть, иначе 0: лента событий придёт позже); считаются только платежи `received`.
- **DQ-25** `paymentStatus`, этап 4: `received` — `pass`; `pending` — `fail` с `info`; иное — `fail` с `exclude` (переопределение `action` у строки, как в DQ-05). Регистрация в `CHECKS`, значок в `rule-meta.ts`, текст в `describe.ts`, фикстура для теста текстов (он идёт и по правилам, которые на реальных данных молчат).
- **DQ-16, DQ-23 у OTA** — только если в разделе 2 выбран (б) или (в).
- `lib/dq/golden.test.ts`: числа прежние, добавляется DQ-25 без провалов. Если сдвинулось что-то ещё — искать ошибку в правилах, а не обновлять эталон.

### Шаг 7. `lib/data` и страницы — 55 мин

Сначала — `node_modules/next/dist/docs/` по тем API, которые трогаются (AGENTS.md).

Файлы: `lib/data/admit.ts`, `dashboard.ts`, `reconciliation.ts`, `quality.ts`, `types.ts`, `index.ts`, тесты, `golden.test.ts`, `invariants.test.ts`; `components/dashboard/kpi-blocks.tsx`, `property-table.tsx`, `outside-figures.tsx`, `figure-sources.tsx`; `components/reconciliation/reconciliation-view.tsx`; `app/import/reconciliation/page.tsx`; `components/status-meta.ts`.

- Виды денег (PLAN.md 7.4) по вердиктам: допущенные `received` → поступило (через `lib/calc`); допущенные `pending` → удержано (из `CashFlow.pending`); `excluded` по DQ-05 `missing` → не привязано; по DQ-05 `reservation_excluded` и по DQ-25 `exclude` → удержано; `pending`-статус строки (на уровне 1 считается `review`) — как сейчас, с флагом; прочие исключения (DQ-03, 04, 06, 07) и дубли — «исключено», как сейчас. Удержано и не привязано — по `payment_date` в периоде.
- Обзор `/`: строки «PBJT к уплате» и owner estimate; удержано и не привязано рядом с поступлениями, не в сумме; таблица по виллам — PBJT и owner estimate; не привязанные — только итогом портфеля.
- `/import/reconciliation`: вместо одного списка «unallocated» — «не привязано» и «удержано» с причиной; переименовать `unallocated` в коде.
- Контрольные суммы платежей на `/import/data-quality`: поступило + удержано + не привязано + исключено + дубли = источник.
- `invariants.test.ts`: каждый платёж — ровно в одном виде денег.
- `golden.test.ts`: меняются Management fees, owner estimate, owner balance; P0036 переходит из «unallocated» в «удержано» (0 IDR).
- Проверить в браузере (`npm run dev`): `/`, `/import/reconciliation`, `/import/data-quality`; цифры против записанных в шаге 0.

### Шаг 8. `lib/nightly` через ядро — 40 мин

Файлы: `lib/nightly/fees.ts` (и при необходимости `snapshots.ts`, `report.ts`), без правки ожиданий в тестах.

- **Ловушка:** `fees.ts` нельзя заменить одним вызовом `calculateReservation`. Адаптер собирает оба кода по всем ночам в их порядке, ядро бросает ошибку на первой ночи. Поэтому проверка правил остаётся в адаптере — через `commissionRulesOn` ядра (то же делает DQ-17 в системе), с правилом «ровно одно правило на ночь» (= политика `ambiguous`).
- Для брони, прошедшей проверку: правила кейса → `CommissionRuleInput` (`rateFromBps`, `feeBasis: 'gross_booking_value'`), снимок → `ReservationInput` (`gross` = accommodation, `pbjt`, `otaFee`, `refund` = 0, `channel: null`, `dqStatus: 'clean'`), `calculateReservation(…, { ...DEFAULT_POLICIES, commissionRuleOverlap: 'ambiguous' })`; строки ночей адаптера — из `ReservationCalc.lines`, `rate_bps` — из правила ночи, найденного проверкой (не пересчитывать дробь обратно в bps).
- Критерии: 147 тестов модуля зелёные без правки ожиданий; `npm run nightly -- final-test/case_public.json final-test/results_public.json` не меняет файл; `npm run nightly:pack` собирается и сам сверяет результат из архива. Архив вшивает sha HEAD — перепаковать после коммита автора.

### Шаг 9. Схема — 30 мин

Файлы: `supabase/schemas/app/tables/dq_check_result.sql`, `dq_record_verdict.sql`, `payment.sql`, `reservation.sql`, `stg_reservation.sql`, `supabase/schemas/app/functions/eff_reservation.sql`; миграция `npm run db:sync`.

- `supersede` в `dq_check_result_action_known`; в `dq_record_verdict` у `superseded` разрешить правило-причину (DQ-02) — при вытеснении `pending` правил по-прежнему нет.
- `payment_status_known`: `received`, `pending`.
- `pbjt numeric` у `reservation` и `stg_reservation`, `null` — источник не прислал.
- `eff_reservation`: по ключу версия с наибольшим `updated_at` среди слоёв; при равном `updated_at` и разном `row_hash` — обе строки (VALIDATION_PLAN.md 2, 7.5).
- Импорт к базе ещё не подключён (фаза 7a), поэтому проверка — сгенерированная миграция читается глазами и применяется к тестовому контейнеру, если он поднят; иначе записать, что не применялась.

### Шаг 10. Документы — 25 мин

- README: методология по PLAN.md 7, новые числа эталона, вопросы финдиректору с ответами ТЗ, раздел «Финальное задание» — модель теперь в ядре.
- Статусы в PLAN.md, CALCULATION_MODULE.md, VALIDATION_PLAN.md: убрать «код считает по-старому до фазы 6b»; числа v1 оставить как историю.
- ROADMAP.md: «Сделано» у фазы 6b с решениями по ходу, факт времени в разделе 5.
- `IMPLEMENTATION_NOTES.md` не трогать: это сданный материал финального задания.

## 5. Контрольные числа

Посчитаны 2026-10-27 независимым скриптом по сырым CSV (не кодом `lib/`).

| Что | v1 (сейчас) | v2 (после фазы) |
|---|--:|--:|
| R0020 (V011, 3 ночи, 0.17): MF | 612 470 | 612 471 = 204 157 × 3 |
| R0020: доля собственника | 2 377 827 | 2 377 826 |
| R0102 (V003, 4 ночи): MF | 662 773 | 662 772 = 165 693 × 4 |
| R0018 (V013, 6 ночей): MF сентябрь / октябрь | 1 274 121 / 1 274 121 | те же (424 707 × 6) |
| R0110: MF | 1 412 581 | 1 412 582 |
| R0067: MF | 1 347 209 | 1 347 208 |
| R0143: MF | 1 182 360 | 1 182 360 |
| V011, сентябрь: Management fees | 4 554 620 | 4 554 621 |
| V011, сентябрь: owner estimate | — | 18 633 447 |
| V011, сентябрь: owner balance | 17 529 860 | 17 529 859 |
| V011, сентябрь: чистая выручка, поступления, сверка | 23 188 068; 10 302 481; −12 885 587 | те же |
| Все строки активных броней в IDR до проверок: Σ MF | 227 024 123 | 227 024 104 (−19) |
| Строк броней, у которых MF изменилась | — | 96, на 1–3 IDR |

Финальное задание (`case_public.json`, FINAL_TEST_PLAN.md 5) — не меняется: комиссия ноябрь 374 000, декабрь 640 000, итог 1 014 000; поступило 6 380 000, удержано 50 000 (P303 `pending`), не привязано 100 000 (P404); R101: 374 000 + 440 000, P101 = 4 400 000 + 440 000 − 660 000 = 4 180 000.

Точные итоги портфеля после статусов DQ фиксирует обновлённый `lib/data/golden.test.ts` в шаге 3.

## 6. Проверки после каждого шага

```
npm run lint
npm run typecheck:lib
npm run test:lib          # покрытие lib/ 100 %, включая lib/nightly
npm run test:lib:tz       # Kiritimati и Los Angeles
npm test                  # всё, включая components/
```

После шагов 3, 4 и 8 дополнительно: `npm run nightly -- final-test/case_public.json final-test/results_public.json && git diff --exit-code final-test/results_public.json`. После шагов 3 и 7 — цифры дашборда против шага 0: разница только в комиссии и оценках собственника.

## 7. Чего не делаем

- Лента событий как сущность импорта (`reservation_event`) — фаза 10.
- Срок выплаты OTA отдельным правилом — после ответа финдиректора.
- Курс USD: бронь в другой валюте по-прежнему исключается (DQ-06).
- Импорт в базу, SQL-версии DQ-02 и DQ-17 — уровень 2 (фазы 7a–7b).
- Правка `IMPLEMENTATION_NOTES.md` и сданного архива финального задания.

## 8. Время

| Шаг | План | Факт |
|---|--:|--:|
| 0. Исходная точка | 10 мин | |
| 1. Политика пересечения | 10 мин | |
| 2. Поля входа | 20 мин | |
| 3. Ставка и округление по ночам | 40 мин | |
| 4. Показатели | 20 мин | |
| 5. Версии брони | 30 мин | |
| 6. Остальные правила | 40 мин | |
| 7. `lib/data` и страницы | 55 мин | |
| 8. `lib/nightly` через ядро | 40 мин | |
| 9. Схема | 30 мин | |
| 10. Документы | 25 мин | |
| **Итого** | **5 ч 20 мин** | |
