SET local check_function_bodies = off;

ALTER TABLE "app"."dq_check_result"
  DROP CONSTRAINT "dq_check_result_action_known";

ALTER TABLE "app"."dq_record_verdict"
  DROP CONSTRAINT "dq_record_verdict_reasons";

ALTER TABLE "app"."payment"
  DROP CONSTRAINT "payment_status_known";

DROP FUNCTION "app"."eff_reservation"(uuid);

ALTER TABLE "app"."reservation"
  ADD COLUMN "pbjt" numeric(18,2);

ALTER TABLE "app"."stg_reservation"
  ADD COLUMN "pbjt" numeric;

CREATE OR REPLACE FUNCTION app.eff_reservation (
  p_batch_id uuid
)
  RETURNS TABLE (
    raw_record_id       bigint,
    batch_id            uuid,
    origin              text,
    row_hash            text,
    reservation_id      text,
    property_id         text,
    check_in            date,
    check_out           date,
    status              text,
    gross_booking_value numeric,
    pbjt                numeric,
    currency            text,
    ota_fee             numeric,
    refund_amount       numeric,
    channel             text,
    updated_at          date,
    stay                daterange,
    nights              integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
with latest_verdict as (
  select distinct on (v.raw_record_id) v.raw_record_id, v.status
    from app.dq_record_verdict v
    join app.dq_run r on r.run_id = v.run_id
   where r.status <> 'failed'
   order by v.raw_record_id, r.started_at desc
),
batch_rows as (
  select s.raw_record_id, s.batch_id, rr.row_hash, s.reservation_id, s.property_id, s.check_in, s.check_out, s.status, s.gross_booking_value, s.pbjt, s.currency, s.ota_fee, s.refund_amount, s.channel, s.updated_at, s.stay, s.nights
    from app.stg_reservation s
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
   where s.batch_id = p_batch_id
),
published as (
  select t.raw_record_id, rr.batch_id, t.row_hash, b.started_at, t.reservation_id, t.property_id, t.check_in, t.check_out, t.status, t.gross_booking_value, t.pbjt, t.currency, t.ota_fee, t.refund_amount, t.channel, t.updated_at, t.stay, t.nights
    from app.reservation t
    join app.raw_record rr on rr.raw_record_id = t.raw_record_id
    join app.import_batch b on b.batch_id = rr.batch_id
),
waiting as (
  select s.raw_record_id, s.batch_id, rr.row_hash, b.started_at, s.reservation_id, s.property_id, s.check_in, s.check_out, s.status, s.gross_booking_value, s.pbjt, s.currency, s.ota_fee, s.refund_amount, s.channel, s.updated_at, s.stay, s.nights
    from app.stg_reservation s
    join latest_verdict lv on lv.raw_record_id = s.raw_record_id
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
    join app.import_batch b on b.batch_id = s.batch_id
   where lv.status in ('pending', 'excluded', 'duplicate')
     and s.batch_id is distinct from p_batch_id
     and not exists (select 1 from published p where p.reservation_id = s.reservation_id and p.started_at >= b.started_at)
),
waiting_latest as (
  select w.*
    from waiting w
   where w.reservation_id is null
      or w.started_at = (select max(w2.started_at) from waiting w2 where w2.reservation_id = w.reservation_id)
),
candidates as (
  select 1 as layer, 'batch' as origin, raw_record_id, batch_id, row_hash, reservation_id, property_id, check_in, check_out, status, gross_booking_value, pbjt, currency, ota_fee, refund_amount, channel, updated_at, stay, nights
    from batch_rows
  union all
  select 2, 'pending', raw_record_id, batch_id, row_hash, reservation_id, property_id, check_in, check_out, status, gross_booking_value, pbjt, currency, ota_fee, refund_amount, channel, updated_at, stay, nights
    from waiting_latest
  union all
  select 3, 'published', raw_record_id, batch_id, row_hash, reservation_id, property_id, check_in, check_out, status, gross_booking_value, pbjt, currency, ota_fee, refund_amount, channel, updated_at, stay, nights
    from published
),
ranked as (
  select c.*,
         max(c.updated_at) over (partition by c.reservation_id) as latest_at,
         min(c.layer) over (partition by c.reservation_id, c.updated_at, c.row_hash) as first_layer
    from candidates c
)
select raw_record_id, batch_id, origin, row_hash, reservation_id, property_id, check_in, check_out, status, gross_booking_value, pbjt, currency, ota_fee, refund_amount, channel, updated_at, stay, nights
  from ranked
 where reservation_id is null
    or (layer = 1 and updated_at is null)
    or (updated_at = latest_at and layer = first_layer)
 order by 1;
$function$;

ALTER TABLE "app"."dq_check_result"
  ADD CONSTRAINT "dq_check_result_action_known"
    CHECK ((action = ANY (ARRAY['duplicate'::text, 'supersede'::text, 'exclude'::text, 'decide'::text, 'hold'::text, 'review'::text, 'info'::text])));

ALTER TABLE "app"."dq_record_verdict"
  ADD CONSTRAINT "dq_record_verdict_reasons" CHECK (
CASE status
    WHEN 'superseded'::text THEN ((rule_ids <@ ARRAY['DQ-02'::text]) AND (decision_id IS NULL))
    WHEN 'clean'::text THEN (cardinality(rule_ids) = 0)
    ELSE ((cardinality(rule_ids) > 0) OR (decision_id IS NOT NULL))
END);

ALTER TABLE "app"."payment"
  ADD CONSTRAINT "payment_status_known" CHECK ((status = ANY (ARRAY['received'::text, 'pending'::text])));

COMMENT ON FUNCTION "app"."eff_reservation"(uuid) IS 'Действующий набор броней для проверок: строки пачки, pending/excluded/duplicate прежних пачек и опубликованные; по ключу (reservation_id) — версия с наибольшим updated_at, одинаковое содержимое один раз из первого слоя, при равном updated_at и разном содержимом — обе. origin: batch | pending | published.';
