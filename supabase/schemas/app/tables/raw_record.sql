-- Сырые строки файлов: значения текстом, как в источнике, без приведения типов.
-- Только дописывание. Это первичный след для аудита: по нему можно заново построить staging
-- и найти источник любой версии записи.
-- Единица проверки качества — строка, а не ID: у полного дубля R0015 две строки, у каждой свой вердикт.
create table app.raw_record (
  raw_record_id bigint generated always as identity primary key,
  batch_id uuid not null,
  file_id bigint not null,
  line_no integer not null,  -- номер строки в файле; заголовок — строка 1
  record_key text,  -- значение ключевой колонки как есть (R0015); null, если оно пустое
  payload jsonb not null,  -- {"reservation_id": "R0015", "check_in": "2026-09-03", ...}
  row_hash text not null,  -- sha256 нормализованных значений: полные дубли (DQ-01), изменения между пачками
  constraint raw_record_file_fkey
  foreign key (file_id, batch_id) references app.import_file (file_id, batch_id),
  constraint raw_record_line_unique unique (file_id, line_no),
  -- цель составного FK из stg_*: типизированная строка всегда из той же пачки
  constraint raw_record_batch_key unique (raw_record_id, batch_id),
  constraint raw_record_line_after_header check (line_no >= 2),
  constraint raw_record_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint raw_record_row_hash_hex check (row_hash ~ '^[0-9a-f]{64}$')
);

create index raw_record_batch_record_key on app.raw_record (batch_id, record_key);

alter table app.raw_record enable row level security;

create trigger raw_record_append_only
before update or delete or truncate on app.raw_record
for each statement execute function app.forbid_change();
