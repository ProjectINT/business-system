-- Staging броней: типизированные строки пачки без бизнес-ограничений.
-- Нераспознанное значение — null, исходный текст в raw_record.payload, ошибку фиксирует DQ-03.
-- Пересечения периодов проживания измеряет DQ-12 запросом по stay (VALIDATION_PLAN.md, 7.2).
create table app.stg_reservation (
  raw_record_id bigint primary key,
  batch_id uuid not null,
  reservation_id text,
  property_id text,
  check_in date,
  check_out date,
  status text,
  gross_booking_value numeric,
  pbjt numeric,  -- null — в файле нет колонки (CSV) или значение не разобралось
  currency text,
  ota_fee numeric,
  refund_amount numeric,
  channel text,
  updated_at date,
  -- '[)': ночь заезда входит, день выезда нет. null, если даты не разобрались или выезд не позже
  -- заезда: daterange вызвал бы ошибку и строка не сохранилась бы. Такие брони ловит DQ-07.
  stay daterange generated always as (
    case when check_out > check_in then daterange(check_in, check_out, '[)') end
  ) stored,
  nights integer generated always as (check_out - check_in) stored,
  constraint stg_reservation_raw_record_fkey
  foreign key (raw_record_id, batch_id) references app.raw_record (raw_record_id, batch_id)
);

create index stg_reservation_batch on app.stg_reservation (batch_id, reservation_id);
create index stg_reservation_stay on app.stg_reservation using gist (batch_id, property_id, stay);

alter table app.stg_reservation enable row level security;
