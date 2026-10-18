-- Объекты (виллы), прошедшие проверки. Как во всех основных таблицах:
--   * строки публикует dq_run из staging, ограничения — последняя линия защиты после проверок;
--   * ограничения описывают инварианты, неверные при любой политике. Спорное (действие review)
--     сюда попадает и помечается в журнале DQ;
--   * raw_record_id и row_hash — происхождение текущей версии, история версий — в app.record_version.
create table app.property (
  property_id text primary key,
  property_name text not null,
  cluster text not null,  -- район: Ubud, Canggu, Sanur, Bukit; справочника нет
  owner_id text not null references app.owner,
  base_currency text not null,
  raw_record_id bigint not null references app.raw_record,  -- строка источника текущей версии
  row_hash text not null,  -- импорт обновляет запись, только если хэш строки изменился
  constraint property_id_format check (property_id ~ '^V\d{3}$'),
  constraint property_base_currency_iso check (base_currency ~ '^[A-Z]{3}$'),
  -- цель FK из reservation, payment, expense: валюта суммы = базовая валюта объекта (DQ-06)
  constraint property_currency_key unique (property_id, base_currency)
);

create index property_owner on app.property (owner_id);

alter table app.property enable row level security;

create trigger property_history
after insert or update or delete on app.property
for each row execute function app.capture_record_version('property_id');
