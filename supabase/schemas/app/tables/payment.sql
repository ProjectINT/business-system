-- Поступления денег по броням. Происхождение и история версий — как в app.property.
-- Платёж без брони или по исключённой брони сюда не попадает (DQ-05): его сумма показывается
-- как «нераспределено» из staging.
-- Совпадение объекта платежа с объектом брони не ограничивается: расхождение уходит в review (DQ-19).
create table app.payment (
  payment_id text primary key,
  reservation_id text not null references app.reservation,
  property_id text not null,
  payment_date date not null,
  amount numeric(18, 2) not null,
  currency text not null,
  status text not null,
  raw_record_id bigint not null references app.raw_record,
  row_hash text not null,
  constraint payment_id_format check (payment_id ~ '^P\d{4}$'),
  constraint payment_amount_not_negative check (amount >= 0),  -- нулевые поступления по отменам бывают (DQ-15)
  -- в источнике только received; смысл других статусов движку неизвестен
  constraint payment_status_known check (status in ('received')),
  constraint payment_property_currency_fkey
  foreign key (property_id, currency) references app.property (property_id, base_currency)
);

create index payment_reservation on app.payment (reservation_id);
create index payment_property_date on app.payment (property_id, payment_date);

alter table app.payment enable row level security;

create trigger payment_history
after insert or update or delete on app.payment
for each row execute function app.capture_record_version('payment_id');
