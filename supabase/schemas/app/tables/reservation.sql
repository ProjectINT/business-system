-- Брони со статусом проверки clean или review. Происхождение и история версий — как в app.property.
-- Пересечения здесь разрешены: бронь — финансовый факт, даже если её даты конфликтуют с другой.
-- Запрет пересечений действует только в app.occupancy.
-- Знак ota_fee не ограничен: отрицательная комиссия OTA — сомнение (DQ-08, review), а не инвариант.
-- Возврат у неотменённой брони тоже не запрещён: это политика (DQ-09), а не невозможное значение.
create table app.reservation (
  reservation_id text primary key,
  property_id text not null,
  check_in date not null,
  check_out date not null,
  status text not null,
  gross_booking_value numeric(18, 2) not null,
  currency text not null,
  ota_fee numeric(18, 2) not null,
  refund_amount numeric(18, 2) not null,
  channel text not null,
  updated_at date not null,  -- дата изменения в источнике, не время записи в базу
  -- для modified: исходная бронь. В источнике связи нет (DQ-13), её задаёт решение link_origin
  origin_reservation_id text references app.reservation,
  -- '[)': ночь заезда входит, день выезда нет
  stay daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  nights integer generated always as (check_out - check_in) stored,
  raw_record_id bigint not null references app.raw_record,
  row_hash text not null,
  constraint reservation_id_format check (reservation_id ~ '^R\d{4}$'),
  constraint reservation_status_known check (status in ('confirmed', 'modified', 'cancelled')),
  constraint reservation_channel_known check (channel in ('OTA', 'Direct')),
  constraint reservation_nights_positive check (check_out > check_in),
  constraint reservation_gbv_positive check (gross_booking_value > 0),
  constraint reservation_refund_bounds check (refund_amount >= 0 and refund_amount <= gross_booking_value),
  constraint reservation_origin_not_self check (origin_reservation_id <> reservation_id),
  -- объект существует (DQ-04) и валюта брони = базовая валюта объекта (DQ-06)
  constraint reservation_property_currency_fkey
  foreign key (property_id, currency) references app.property (property_id, base_currency),
  -- цель составного FK из occupancy: календарь всегда совпадает с виллой и датами брони
  constraint reservation_occupancy_key unique (reservation_id, property_id, stay)
);

create index reservation_property_check_in on app.reservation (property_id, check_in);

alter table app.reservation enable row level security;

create trigger reservation_history
after insert or update or delete on app.reservation
for each row execute function app.capture_record_version('reservation_id');
