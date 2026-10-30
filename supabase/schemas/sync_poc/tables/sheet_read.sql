-- Журнал сырых ответов Google Sheets API: что синхронизация прочитала из листа на каждом проходе.
-- Пишется вне транзакции прохода, поэтому остаётся и тогда, когда проход упал. Код удаляет записи старше 7 дней.
create table sync_poc.sheet_read (
  id bigint generated always as identity primary key,
  read_at timestamptz not null default now(),
  spreadsheet_id text not null,
  tab text not null,  -- название листа
  response jsonb not null,  -- ответ spreadsheets.values.get как есть: range, majorDimension, values
  row_count integer not null,  -- строк в ответе, включая заголовок
  error text  -- ошибка прохода, если он упал после чтения листа
);

-- Для очистки старых записей и выборки последних чтений.
create index sheet_read_read_at on sync_poc.sheet_read (read_at);

alter table sync_poc.sheet_read enable row level security;

revoke all on sync_poc.sheet_read from public, anon, authenticated;
