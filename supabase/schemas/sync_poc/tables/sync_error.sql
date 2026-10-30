-- Проблемы со строками листа при синхронизации. Открытые — resolved_at is null.
-- Каждый проход проверяет строки заново: повтор ошибки сдвигает last_seen_at, пропавшая ошибка получает resolved_at.
create table sync_poc.sync_error (
  id bigint generated always as identity primary key,
  row_key text not null,  -- villa.id строки, а у новой строки без id — 'row:<номер строки в листе>'
  sheet_row integer,  -- номер строки в листе; null, если строки в листе нет (например, конфликт удаления)
  kind text not null check (kind in ('duplicate_id', 'unknown_id', 'deleted_in_db', 'validation', 'constraint', 'conflict')),
  message text not null,
  sheet_values jsonb,  -- значения строки в листе на момент последней проверки
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Код синхронизации делает insert ... on conflict (row_key, kind, message) where resolved_at is null.
create unique index sync_error_open_key on sync_poc.sync_error (row_key, kind, message) where resolved_at is null;

alter table sync_poc.sync_error enable row level security;

revoke all on sync_poc.sync_error from public, anon, authenticated;
