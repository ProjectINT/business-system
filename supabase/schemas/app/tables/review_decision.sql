-- Решение человека (VALIDATION_PLAN.md, 7.5). Принимается на бронь случая разбора: case_key общий у решений
-- по одному случаю, record_key — бронь. У решения по флагу review заполнен issue_id.
-- Только дописывание: новое решение заменяет предыдущее, старое остаётся в истории.
-- Решение действует, пока по нему не пришли новые данные: row_hash совпадает с текущей строкой, а у decide
-- и состав случая тот же (case_key). Иначе решения снимаются и человеку не подставляются.
-- Входящие данные не исправляем: решение выбирает, каким записям верить, но значений не меняет.
--   accept         — бронь верна: в календарь и в финансы;
--   finance_only   — только в финансы, с флагом (публикуется как review): деньги реальные, гостя переселили;
--   exclude        — не в календарь и не в финансы, суммы в «исключено»; так же помечается исходная бронь,
--                    которую заменила modified-бронь (payload.replaced_by);
--   keep_published — только у брони, уже опубликованной в другой версии: остаётся опубликованная версия,
--                    входящая не принимается.
-- payload допускается у любого решения: у modified-брони {"origin": "R0027" | null, "merge": true} — связь
-- с исходной бронью и слияние платежей; у исходной брони {"replaced_by": "R0146"}.
create table app.review_decision (
  decision_id bigint generated always as identity primary key,
  issue_id bigint references app.dq_issue,  -- у решений по флагам review; у решений по случаю null
  case_key text,  -- ключ случая: 'V003:R0017,R0029,…', 'M:R0143', 'V:reservation:R0001'
  record_key text not null,  -- запись, по которой принято решение: R0146
  decision text not null,
  row_hash text not null,  -- версия строки, на которой принято решение
  payload jsonb,
  comment text not null,  -- обоснование обязательно: это аудит
  decided_by text not null,  -- пользователь; до появления входа — имя из интерфейса или CLI
  decided_at timestamptz not null default now(),
  constraint review_decision_known check (decision in ('accept', 'finance_only', 'exclude', 'keep_published')),
  -- решение относится к случаю или к проблеме-флагу
  constraint review_decision_target check (case_key is not null or issue_id is not null),
  constraint review_decision_payload_object check (payload is null or jsonb_typeof(payload) = 'object'),
  constraint review_decision_comment_present check (btrim(comment) <> '')
);

-- действующее решение по брони случая — последнее
create index review_decision_case on app.review_decision (case_key, record_key, decided_at desc)
where case_key is not null;
-- действующее решение по проблеме-флагу — последнее
create index review_decision_issue on app.review_decision (issue_id, decided_at desc)
where issue_id is not null;

alter table app.review_decision enable row level security;

create trigger review_decision_append_only
before update or delete or truncate on app.review_decision
for each statement execute function app.forbid_change();
