-- Staging расходов: типизированные строки пачки без бизнес-ограничений.
-- Нераспознанное значение — null, исходный текст в raw_record.payload, ошибку фиксирует DQ-03.
create table app.stg_expense (
  raw_record_id bigint primary key,
  batch_id uuid not null,
  expense_id text,
  property_id text,
  expense_date date,
  category text,
  amount numeric,
  currency text,
  payment_status text,
  constraint stg_expense_raw_record_fkey
  foreign key (raw_record_id, batch_id) references app.raw_record (raw_record_id, batch_id)
);

create index stg_expense_batch on app.stg_expense (batch_id, expense_id);

alter table app.stg_expense enable row level security;
