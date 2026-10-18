-- Проверка, что вилла свободна, когда бронь допускается в календарь занятости (app.occupancy).
-- Аналог check_vehicle_availability_on_status_change из проекта аренды машин. Отличия:
--   * «блокирующие статусы» заменяет сама строка в occupancy: туда попадают только активные
--     брони без открытого пересечения (DQ-12), при отмене брони строка удаляется;
--   * таймаута черновиков и буфера между заказами (nextOrderDate) нет: черновиков в данных нет,
--     выезд и заезд в один день допустимы;
--   * даты календарные (date), часовые пояса не участвуют.
-- Гарантию даёт ограничение occupancy_no_overlap: триггер не видит незакоммиченную вставку
-- параллельной транзакции, а EXCLUDE видит. Триггер нужен ради понятной ошибки с номером брони.
create or replace function app.check_property_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  conflict record;
begin
  -- 1. Проверка нужна при INSERT и при UPDATE, если поменялась вилла или даты.
  --    UPDATE OF срабатывает и тогда, когда колонка есть в SET, но значение не изменилось.
  if tg_op = 'UPDATE'
     and new.property_id is not distinct from old.property_id
     and new.stay is not distinct from old.stay then
    return new;
  end if;

  -- 2. Ищем пересечение. На диапазонах '[)' оператор && не считает пересечением
  --    выезд и заезд в один день. Запрос идёт по GiST-индексу ограничения occupancy_no_overlap.
  select o.reservation_id,
         o.stay,
         upper(o.stay * new.stay) - lower(o.stay * new.stay) as common_nights
    into conflict
    from app.occupancy o
   where o.property_id = new.property_id
     and o.stay && new.stay
     -- при UPDATE старая версия строки ещё в таблице, её не считаем
     and (tg_op = 'INSERT' or o.reservation_id <> old.reservation_id)
   order by lower(o.stay), o.reservation_id
   limit 1;

  if found then
    raise exception 'Villa % is not available for reservation % %: overlaps reservation % %, % night(s) in common',
      new.property_id, new.reservation_id, new.stay,
      conflict.reservation_id, conflict.stay, conflict.common_nights
      using errcode    = 'exclusion_violation',  -- 23P01, тот же код, что у EXCLUDE
            schema     = 'app',
            table      = 'occupancy',
            constraint = 'occupancy_no_overlap',
            hint       = 'Resolve the overlap in the review queue before admitting the reservation';
  end if;

  return new;
end;
$$;

comment on function app.check_property_availability() is
'Не даёт допустить в календарь бронь, которая пересекается с уже допущенной на той же вилле. Интервалы [check_in, check_out): выезд и заезд в один день не пересечение. Ошибка 23P01 с номером конфликтующей брони.';
