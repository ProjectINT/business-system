-- Календарь занятости вилл: строка на каждую бронь, допущенную в календарь.
-- Сюда попадают активные брони (confirmed, modified) без открытого пересечения DQ-12 или с решением
-- accept по нему. При отмене брони строка удаляется. Пересечения запрещены только в этой таблице.
create table app.occupancy (
  reservation_id text primary key,
  property_id text not null,
  stay daterange not null,
  admitted_run_id uuid not null references app.dq_run,  -- запуск, который допустил бронь
  decision_id bigint references app.review_decision,  -- null — допущена автоматически
  admitted_at timestamptz not null default now(),
  -- Вилла и даты всегда совпадают с бронью. Изменение брони каскадом обновляет строку, и та снова
  -- проходит проверку пересечений: если новые даты конфликтуют, изменение брони откатится.
  -- Поэтому публикация сначала убирает из календаря брони, по которым снова открыт DQ-12.
  constraint occupancy_reservation_fkey
  foreign key (reservation_id, property_id, stay)
  references app.reservation (reservation_id, property_id, stay)
  on update cascade on delete cascade,
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
