-- Операционные расходы объектов. Происхождение и история версий — как в app.property.
-- Расход без существующего объекта (E0017 → V777) сюда не попадает (DQ-04): его сумма
-- показывается как «нераспределено» из staging.
create table app.expense (
  expense_id text primary key,
  property_id text not null,
  expense_date date not null,
  category text not null,  -- справочника нет: новая категория — не ошибка
  amount numeric(18, 2) not null,
  currency text not null,
  payment_status text not null,
  raw_record_id bigint not null references app.raw_record,
  row_hash text not null,
  constraint expense_id_format check (expense_id ~ '^E\d{4}$'),
  constraint expense_amount_positive check (amount > 0),
  constraint expense_payment_status_known check (payment_status in ('paid', 'pending')),
  constraint expense_property_currency_fkey
  foreign key (property_id, currency) references app.property (property_id, base_currency)
);

create index expense_property_date on app.expense (property_id, expense_date);

alter table app.expense enable row level security;

create trigger expense_history
after insert or update or delete on app.expense
for each row execute function app.capture_record_version('expense_id');
