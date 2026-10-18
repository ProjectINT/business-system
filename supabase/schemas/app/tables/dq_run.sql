-- Запуск проверок качества по пачке и публикация её данных (VALIDATION_PLAN.md, раздел 5).
-- Журнал (dq_check_result, dq_record_verdict, dq_issue) и публикация идут разными транзакциями:
-- если публикация упала, журнал остаётся для разбора, а запуск получает статус failed.
create table app.dq_run (
  run_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references app.import_batch,
  as_of date not null,  -- дата среза: от неё зависят DQ-16 и DQ-20
  as_of_defaulted boolean not null,  -- true: в пачке даты нет, выбрана по правилу (последний updated_at)
  code_version text not null,  -- git sha
  rules jsonb not null,  -- [{"id": "DQ-01", "version": 1}, ...]
  status text not null default 'running',
  started_by text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  summary jsonb,  -- счётчики: статусы строк по файлам, итог публикации (новые / изменённые / без изменений)
  constraint dq_run_status_known check (status in ('running', 'succeeded', 'failed')),
  constraint dq_run_finished check ((status = 'running') = (finished_at is null)),
  constraint dq_run_failed_has_error check ((status = 'failed') = (error is not null)),
  constraint dq_run_rules_array check (jsonb_typeof(rules) = 'array')
);

create index dq_run_batch on app.dq_run (batch_id, started_at desc);

alter table app.dq_run enable row level security;
