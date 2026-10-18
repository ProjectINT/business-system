-- Файл в пачке, по одному на сущность. sha256 файла — основа идемпотентности повторного импорта.
-- Заголовок хранится, чтобы видеть изменение формата источника (DQ-03).
create table app.import_file (
  file_id bigint generated always as identity primary key,
  batch_id uuid not null references app.import_batch,
  entity app.source_entity not null,
  file_name text not null,
  file_sha256 text not null,
  byte_size integer not null,
  header text[] not null,  -- колонки в порядке файла
  row_count integer not null,  -- строк данных без заголовка; сверяется в DQ-90
  constraint import_file_one_per_entity unique (batch_id, entity),
  -- цель составного FK из raw_record: строка и её файл всегда из одной пачки
  constraint import_file_batch_key unique (file_id, batch_id),
  constraint import_file_sha256_hex check (file_sha256 ~ '^[0-9a-f]{64}$'),
  constraint import_file_counts_not_negative check (byte_size >= 0 and row_count >= 0)
);

-- поиск такого же файла в прошлых пачках
create index import_file_sha256 on app.import_file (entity, file_sha256);

alter table app.import_file enable row level security;
