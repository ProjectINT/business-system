-- ЧЕРНОВИК: минимум полей, нужный для проверки пересечений. Финансовые поля добавим со схемой данных.
-- Пересечения здесь разрешены: бронь — финансовый факт, даже если её даты конфликтуют с другой.
-- Запрет пересечений действует только в app.occupancy.
create table app.reservation (
  reservation_id text primary key,
  property_id    text      not null references app.property,
  check_in       date      not null,
  check_out      date      not null,
  status         text      not null,
  -- '[)': ночь заезда входит, день выезда нет.
  stay           daterange generated always as (daterange(check_in, check_out, '[)')) stored,
  constraint reservation_status_known check (status in ('confirmed', 'modified', 'cancelled')),
  constraint reservation_nights_positive check (check_out > check_in)
);

alter table app.reservation enable row level security;
