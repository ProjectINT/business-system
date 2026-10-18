SET local check_function_bodies = off;

CREATE SCHEMA "app";

CREATE EXTENSION "btree_gist" SCHEMA "extensions";

CREATE TABLE "app"."occupancy" (
  "reservation_id" text                     NOT NULL,
  "property_id"    text                     NOT NULL,
  "stay"           daterange                NOT NULL,
  "admitted_by"    text                     NOT NULL,
  "admitted_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "occupancy_pkey" PRIMARY KEY (reservation_id),
  CONSTRAINT "occupancy_stay_bounded" CHECK (((NOT isempty(stay)) AND (NOT lower_inf(stay)) AND (NOT upper_inf(stay))))
);

ALTER TABLE "app"."occupancy"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."property" (
  "property_id"   text NOT NULL,
  "property_name" text NOT NULL,
  CONSTRAINT "property_pkey" PRIMARY KEY (property_id)
);

ALTER TABLE "app"."property"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."reservation" (
  "reservation_id" text NOT NULL,
  "property_id"    text NOT NULL,
  "check_in"       date NOT NULL,
  "check_out"      date NOT NULL,
  "status"         text NOT NULL,
  CONSTRAINT "reservation_nights_positive" CHECK ((check_out > check_in)),
  CONSTRAINT "reservation_pkey" PRIMARY KEY (reservation_id),
  CONSTRAINT "reservation_status_known" CHECK ((status = ANY (ARRAY['confirmed'::text, 'modified'::text, 'cancelled'::text])))
);

ALTER TABLE "app"."reservation"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "app"."reservation"
  ADD COLUMN "stay" daterange GENERATED ALWAYS AS (daterange(check_in, check_out, '[)'::text)) STORED;

CREATE OR REPLACE FUNCTION app.check_property_availability()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "app"."occupancy"
  ADD CONSTRAINT "occupancy_no_overlap" EXCLUDE USING gist (property_id WITH =, stay WITH &&);

ALTER TABLE "app"."occupancy"
  ADD CONSTRAINT "occupancy_property_id_fkey" FOREIGN KEY (property_id) REFERENCES app.property(property_id);

ALTER TABLE "app"."occupancy"
  ADD CONSTRAINT "occupancy_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES app.reservation(reservation_id) ON DELETE CASCADE;

ALTER TABLE "app"."reservation"
  ADD CONSTRAINT "reservation_property_id_fkey" FOREIGN KEY (property_id) REFERENCES app.property(property_id);

CREATE TRIGGER occupancy_check_availability
  BEFORE INSERT OR UPDATE OF property_id, stay ON app.occupancy
  FOR EACH ROW
  EXECUTE FUNCTION app.check_property_availability();

COMMENT ON EXTENSION "btree_gist" IS 'support for indexing common datatypes in GiST';

COMMENT ON FUNCTION "app"."check_property_availability"() IS 'Не даёт допустить в календарь бронь, которая пересекается с уже допущенной на той же вилле. Интервалы [check_in, check_out): выезд и заезд в один день не пересечение. Ошибка 23P01 с номером конфликтующей брони.';

COMMENT ON TRIGGER "occupancy_check_availability" ON "app"."occupancy" IS 'Перед допуском брони в календарь или сменой виллы/дат проверяет, что вилла свободна. Понятная ошибка с номером конфликтующей брони; гарантию даёт occupancy_no_overlap.';
