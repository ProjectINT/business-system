-- Проблема качества данных, которая живёт между запусками: правило × запись по естественному ключу.
-- Открывают её только действия decide и review (VALIDATION_PLAN.md, раздел 4): duplicate и exclude —
-- окончательные решения системы, hold ждёт решения по другой записи, info статус не меняет.
-- Жизненный цикл:
--   open     — правило вернуло fail, решения нет или оно снято;
--   resolved — есть решение человека для текущей версии строки (row_hash), а для decide — и для текущего
--              состава случая;
--   closed   — правило в новом запуске вернуло pass, проблема закрыта автоматически.
-- Пришла новая версия строки (другой row_hash) или изменился состав случая — решение снимается, проблема снова open.
-- Случай разбора (decide, VALIDATION_PLAN.md, 7.5) — проблемы с общим ключом details ->> 'case_key';
-- список случаев и прогресс — представление app.review_case.
create table app.dq_issue (
  issue_id bigint generated always as identity primary key,
  rule_id text not null,
  entity app.source_entity not null,
  record_key text not null,  -- у строки без ключа — 'line:<file_id>:<line_no>'
  action text not null,
  status text not null default 'open',
  row_hash text not null,  -- версия строки, на которой проблема найдена последний раз
  details jsonb,  -- details последнего fail; у decide — ключ случая case_key
  related_keys text[],
  first_run_id uuid not null references app.dq_run,
  last_run_id uuid not null references app.dq_run,
  closed_run_id uuid references app.dq_run,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dq_issue_rule_id_format check (rule_id ~ '^DQ-\d{2}$'),
  constraint dq_issue_action_known check (action in ('decide', 'review')),
  constraint dq_issue_status_known check (status in ('open', 'resolved', 'closed')),
  constraint dq_issue_closed_by_run check ((status = 'closed') = (closed_run_id is not null)),
  constraint dq_issue_decide_has_case check (action <> 'decide' or details ? 'case_key')
);

-- одна незакрытая проблема на правило и запись; закрытые остаются для истории
create unique index dq_issue_active_unique on app.dq_issue (rule_id, entity, record_key)
where status <> 'closed';

-- очередь проверки
create index dq_issue_open on app.dq_issue (status, rule_id) where status = 'open';

-- случаи разбора: проблемы одного случая (app.review_case)
create index dq_issue_case on app.dq_issue ((details ->> 'case_key'))
where action = 'decide' and status <> 'closed';

alter table app.dq_issue enable row level security;
