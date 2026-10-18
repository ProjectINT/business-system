-- Проблема качества данных, которая живёт между запусками: правило × запись по естественному ключу.
-- Жизненный цикл (VALIDATION_PLAN.md, раздел 4):
--   open     — правило вернуло fail, решения нет или оно снято;
--   resolved — есть решение человека для текущей версии строки (row_hash);
--   closed   — правило в новом запуске вернуло pass, проблема закрыта автоматически.
-- Если пришла новая версия строки (другой row_hash), решение снимается и проблема снова open.
create table app.dq_issue (
  issue_id bigint generated always as identity primary key,
  rule_id text not null,
  entity app.source_entity not null,
  record_key text not null,  -- у строки без ключа — 'line:<file_id>:<line_no>'
  action text not null,
  status text not null default 'open',
  row_hash text not null,  -- версия строки, на которой проблема найдена последний раз
  details jsonb,  -- details последнего fail
  related_keys text[],
  first_run_id uuid not null references app.dq_run,
  last_run_id uuid not null references app.dq_run,
  closed_run_id uuid references app.dq_run,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dq_issue_rule_id_format check (rule_id ~ '^DQ-\d{2}$'),
  constraint dq_issue_action_known check (action in ('duplicate', 'exclude', 'review', 'info')),
  constraint dq_issue_status_known check (status in ('open', 'resolved', 'closed')),
  constraint dq_issue_closed_by_run check ((status = 'closed') = (closed_run_id is not null))
);

-- одна незакрытая проблема на правило и запись; закрытые остаются для истории
create unique index dq_issue_active_unique on app.dq_issue (rule_id, entity, record_key)
where status <> 'closed';

-- очередь проверки
create index dq_issue_open on app.dq_issue (status, rule_id) where status = 'open';

alter table app.dq_issue enable row level security;
