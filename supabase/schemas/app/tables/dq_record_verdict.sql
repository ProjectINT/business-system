-- Итоговый статус строки источника в запуске. Выводится из её вердиктов и действующих решений человека
-- по приоритету (VALIDATION_PLAN.md, раздел 4):
--   superseded — строку pending прежней пачки вытеснила новая версия того же ключа, правила её не проверяют;
--   duplicate  — есть fail с действием duplicate;
--   excluded   — иначе есть fail с exclude или решение exclude;
--   pending    — иначе есть fail с decide без действующего решения или fail с hold;
--   review     — иначе есть fail с review или решение finance_only;
--   clean      — иначе, в том числе после решения accept или keep_published; info статус не меняет.
-- Только дописывание.
create table app.dq_record_verdict (
  run_id uuid not null references app.dq_run,
  raw_record_id bigint not null references app.raw_record,
  entity app.source_entity not null,
  record_key text,
  status text not null,
  rule_ids text[] not null default '{}',  -- правила, которые определили статус
  decision_id bigint references app.review_decision,  -- решение человека, которое определило статус; null — статус поставило правило
  admitted_to_occupancy boolean,  -- только для броней: допущена ли в календарь
  constraint dq_record_verdict_pkey primary key (run_id, raw_record_id),
  constraint dq_record_verdict_status_known
  check (status in ('clean', 'review', 'pending', 'excluded', 'duplicate', 'superseded')),
  -- статус поставило правило (rule_ids) или человек (decision_id); у clean и superseded правил-причин нет
  constraint dq_record_verdict_reasons check (
    case status
      when 'superseded' then cardinality(rule_ids) = 0 and decision_id is null
      when 'clean' then cardinality(rule_ids) = 0
      else cardinality(rule_ids) > 0 or decision_id is not null
    end
  ),
  constraint dq_record_verdict_occupancy_for_reservation
  check ((entity = 'reservation') = (admitted_to_occupancy is not null))
);

alter table app.dq_record_verdict enable row level security;

create trigger dq_record_verdict_append_only
before update or delete or truncate on app.dq_record_verdict
for each statement execute function app.forbid_change();
