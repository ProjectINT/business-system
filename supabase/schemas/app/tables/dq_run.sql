-- Запуск проверок по действующему набору данных и публикация (VALIDATION_PLAN.md, разделы 2 и 5).
-- Запуск по пачке (batch_id задан) публикует записи clean и review и находит случаи разбора.
-- Запуск с решениями (batch_id null, кнопка Publish decisions) идёт по тому же набору с решениями
-- человека на входе и публикует записи решённых случаев.
-- Журнал (dq_check_result, dq_record_verdict, dq_issue) и публикация идут разными транзакциями:
-- если публикация упала, журнал остаётся для разбора, а запуск получает статус failed.
create table app.dq_run (
  run_id uuid primary key default gen_random_uuid(),
  batch_id uuid references app.import_batch,  -- null — запуск с решениями без новой пачки
  code_version text not null,  -- git sha
  rules jsonb not null,  -- [{"id": "DQ-01", "version": 1}, ...]
  status text not null default 'running',
  started_by text not null,
  started_at timestamptz not null default now(),  -- его дата по Бали — «сегодня» запуска, от неё зависят DQ-16 и DQ-20
  finished_at timestamptz,
  error text,
  summary jsonb,  -- счётчики: опубликовано, ждёт решения (строк и сумма), исключено; по файлам пачки
  constraint dq_run_status_known check (status in ('running', 'succeeded', 'failed')),
  constraint dq_run_finished check ((status = 'running') = (finished_at is null)),
  constraint dq_run_failed_has_error check ((status = 'failed') = (error is not null)),
  constraint dq_run_rules_array check (jsonb_typeof(rules) = 'array')
);

create index dq_run_batch on app.dq_run (batch_id, started_at desc);

alter table app.dq_run enable row level security;
