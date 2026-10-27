-- Действующий набор броней для запуска проверок (VALIDATION_PLAN.md, 2). Три слоя:
--   batch     — все строки staging пачки p_batch_id (у полного дубля каждая строка получает свой вердикт);
--   pending   — строки прежних пачек, чей последний вердикт pending, excluded или duplicate: ждут решения
--               или перепроверки, не публикуются; по ключу берутся строки самой поздней такой пачки, и только
--               если она позже пачки опубликованной записи (дубль не заслоняет свою опубликованную копию);
--   published — опубликованные записи основной таблицы; raw_record_id и пачка — у текущей версии.
-- v6 (ТЗ финального задания п. 10): по естественному ключу (reservation_id) действует не первый слой, а версия
-- с наибольшим updated_at среди слоёв, поэтому поздно пришедшая старая версия не вытесняет опубликованную
-- новую. Одинаковое содержимое (row_hash) берётся один раз, из первого слоя; при равном updated_at и разном
-- содержимом в набор входят обе строки — их разбирает DQ-02 (случай version, 7.5). Строку пачки, которая не
-- вошла в набор (есть версия новее), раннер отмечает superseded, как вытесненную pending. Строка пачки без
-- ключа или без updated_at входит всегда: её исключает DQ-03.
-- p_batch_id null — запуск с решениями: слоя batch нет.
-- Последний вердикт строки берётся по запускам, кроме failed: их публикация не состоялась, строки такой
-- пачки возвращаются в набор повторным запуском по ней. Строки со статусом superseded в набор не входят.
create or replace function app.eff_reservation(p_batch_id uuid)
returns table (
  raw_record_id bigint,
  batch_id uuid,
  origin text,
  row_hash text,
  reservation_id text,
  property_id text,
  check_in date,
  check_out date,
  status text,
  gross_booking_value numeric,
  pbjt numeric,
  currency text,
  ota_fee numeric,
  refund_amount numeric,
  channel text,
  updated_at date,
  stay daterange,
  nights integer
)
language sql
stable
set search_path = ''
as $$
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
$$;

comment on function app.eff_reservation(uuid) is
'Действующий набор броней для проверок: строки пачки, pending/excluded/duplicate прежних пачек и опубликованные; по ключу (reservation_id) — версия с наибольшим updated_at, одинаковое содержимое один раз из первого слоя, при равном updated_at и разном содержимом — обе. origin: batch | pending | published.';
