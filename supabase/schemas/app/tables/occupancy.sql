-- ЧЕРНОВИК. Календарь занятости вилл: строка на каждую бронь, допущенную в календарь.
-- Сюда попадают активные брони (confirmed, modified) без открытого пересечения DQ-12.
-- При отмене брони строка удаляется. Пересечения запрещены только в этой таблице.
create table app.occupancy (
  reservation_id text        primary key references app.reservation on delete cascade,
  property_id    text        not null references app.property,
  stay           daterange   not null,  -- копия reservation.stay на момент допуска
  admitted_by    text        not null,  -- 'auto' или id решения из очереди проверки
  admitted_at    timestamptz not null default now(),
  constraint occupancy_stay_bounded
    check (not isempty(stay) and not lower_inf(stay) and not upper_inf(stay)),
  -- Гарантия от двойного бронирования, в том числе при параллельных транзакциях. Ошибка 23P01.
  constraint occupancy_no_overlap
    exclude using gist (property_id with =, stay with &&)
);

alter table app.occupancy enable row level security;

create trigger occupancy_check_availability
  before insert or update of property_id, stay on app.occupancy
  for each row execute function app.check_property_availability();

comment on trigger occupancy_check_availability on app.occupancy is
'Перед допуском брони в календарь или сменой виллы/дат проверяет, что вилла свободна. Понятная ошибка с номером конфликтующей брони; гарантию даёт occupancy_no_overlap.';
