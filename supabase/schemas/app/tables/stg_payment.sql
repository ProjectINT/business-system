-- Staging платежей: типизированные строки пачки без бизнес-ограничений.
-- Нераспознанное значение — null, исходный текст в raw_record.payload, ошибку фиксирует DQ-03.
create table app.stg_payment (
  raw_record_id bigint primary key,
  batch_id uuid not null,
  payment_id text,
  reservation_id text,
  property_id text,
  payment_date date,
  amount numeric,
  currency text,
  status text,
  constraint stg_payment_raw_record_fkey
  foreign key (raw_record_id, batch_id) references app.raw_record (raw_record_id, batch_id)
);

create index stg_payment_batch on app.stg_payment (batch_id, payment_id);
-- DQ-05, DQ-14: платёж ↔ бронь внутри пачки
create index stg_payment_batch_reservation on app.stg_payment (batch_id, reservation_id);

alter table app.stg_payment enable row level security;
