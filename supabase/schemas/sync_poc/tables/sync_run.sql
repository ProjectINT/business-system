-- Последний успешный проход синхронизации, ровно одна строка id = 1. Её вставляет миграция,
-- синхронизация делает только UPDATE. Под pg_advisory_xact_lock синхронизация смотрит started_at
-- и решает, нужен ли новый проход.
create table sync_poc.sync_run (
  id integer primary key default 1,
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}',
  constraint sync_run_single_row check (id = 1)
);

alter table sync_poc.sync_run enable row level security;

revoke all on sync_poc.sync_run from public, anon, authenticated;
