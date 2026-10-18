-- Итоговый статус строки источника в запуске. Выводится из её вердиктов по приоритету:
-- duplicate → excluded → review → clean (VALIDATION_PLAN.md, раздел 4).
-- Только дописывание.
create table app.dq_record_verdict (
  run_id uuid not null references app.dq_run,
  raw_record_id bigint not null references app.raw_record,
  entity app.source_entity not null,
  record_key text,
  status text not null,
  rule_ids text[] not null default '{}',  -- правила, которые определили статус
  admitted_to_occupancy boolean,  -- только для броней: допущена ли в календарь
  constraint dq_record_verdict_pkey primary key (run_id, raw_record_id),
  constraint dq_record_verdict_status_known check (status in ('clean', 'review', 'excluded', 'duplicate')),
  constraint dq_record_verdict_reasons check ((status = 'clean') = (cardinality(rule_ids) = 0)),
  constraint dq_record_verdict_occupancy_for_reservation
  check ((entity = 'reservation') = (admitted_to_occupancy is not null))
);

alter table app.dq_record_verdict enable row level security;

create trigger dq_record_verdict_append_only
before update or delete or truncate on app.dq_record_verdict
for each statement execute function app.forbid_change();
