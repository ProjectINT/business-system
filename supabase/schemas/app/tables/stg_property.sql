-- Staging объектов: типизированные строки пачки без бизнес-ограничений (VALIDATION_PLAN.md, раздел 2).
-- Строка есть у каждой строки raw_record этого файла. Значение, которое не разобралось по типу,
-- становится null, исходный текст остаётся в raw_record.payload, ошибку фиксирует DQ-03.
create table app.stg_property (
  raw_record_id bigint primary key,
  batch_id uuid not null,
  property_id text,
  property_name text,
  cluster text,
  owner_id text,
  base_currency text,
  constraint stg_property_raw_record_fkey
  foreign key (raw_record_id, batch_id) references app.raw_record (raw_record_id, batch_id)
);

create index stg_property_batch on app.stg_property (batch_id, property_id);

alter table app.stg_property enable row level security;
