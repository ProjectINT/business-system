-- Снимок последней синхронизации, строка на виллу. Строка изменилась в листе, если хэш её значений
-- ≠ sheet_hash, в базе — если villa.version ≠ db_version.
create table sync_poc.sync_state (
  row_id uuid primary key references sync_poc.villa on delete cascade,
  sheet_hash text,  -- null допустим: как хранить строки, которых нет в листе, решает синхронизация
  db_version integer not null,  -- villa.version на момент синхронизации
  synced_at timestamptz not null default now()
);

alter table sync_poc.sync_state enable row level security;

revoke all on sync_poc.sync_state from public, anon, authenticated;
