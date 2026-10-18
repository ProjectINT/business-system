-- Действующий набор расходов для запуска проверок (VALIDATION_PLAN.md, 2). Три слоя, при совпадении
-- естественного ключа (expense_id) действует первый:
--   batch     — все строки staging пачки p_batch_id (у полного дубля каждая строка получает свой вердикт);
--   pending   — строки прежних пачек, чей последний вердикт pending, excluded или duplicate: ждут решения
--               или перепроверки, не публикуются; по ключу берутся строки самой поздней такой пачки, и только
--               если она позже пачки опубликованной записи (дубль не заслоняет свою опубликованную копию);
--   published — опубликованные записи основной таблицы; raw_record_id и пачка — у текущей версии.
-- p_batch_id null — запуск с решениями: слоя batch нет.
-- Последний вердикт строки берётся по запускам, кроме failed: их публикация не состоялась, строки такой
-- пачки возвращаются в набор повторным запуском по ней. Строки со статусом superseded в набор не входят.
create or replace function app.eff_expense(p_batch_id uuid)
returns table (
  raw_record_id bigint,
  batch_id uuid,
  origin text,
  row_hash text,
  expense_id text,
  property_id text,
  expense_date date,
  category text,
  amount numeric,
  currency text,
  payment_status text
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
  select s.raw_record_id, s.batch_id, rr.row_hash, s.expense_id, s.property_id, s.expense_date, s.category, s.amount, s.currency, s.payment_status
    from app.stg_expense s
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
   where s.batch_id = p_batch_id
),
published as (
  select t.raw_record_id, rr.batch_id, t.row_hash, b.started_at, t.expense_id, t.property_id, t.expense_date, t.category, t.amount, t.currency, t.payment_status
    from app.expense t
    join app.raw_record rr on rr.raw_record_id = t.raw_record_id
    join app.import_batch b on b.batch_id = rr.batch_id
   where not exists (select 1 from batch_rows x where x.expense_id = t.expense_id)
),
waiting as (
  select s.raw_record_id, s.batch_id, rr.row_hash, b.started_at, s.expense_id, s.property_id, s.expense_date, s.category, s.amount, s.currency, s.payment_status
    from app.stg_expense s
    join latest_verdict lv on lv.raw_record_id = s.raw_record_id
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
    join app.import_batch b on b.batch_id = s.batch_id
   where lv.status in ('pending', 'excluded', 'duplicate')
     and s.batch_id is distinct from p_batch_id
     and not exists (select 1 from batch_rows x where x.expense_id = s.expense_id)
     and not exists (select 1 from published p where p.expense_id = s.expense_id and p.started_at >= b.started_at)
),
waiting_latest as (
  select w.*
    from waiting w
   where w.expense_id is null
      or w.started_at = (select max(w2.started_at) from waiting w2 where w2.expense_id = w.expense_id)
)
select raw_record_id, batch_id, 'batch', row_hash, expense_id, property_id, expense_date, category, amount, currency, payment_status
  from batch_rows
union all
select raw_record_id, batch_id, 'pending', row_hash, expense_id, property_id, expense_date, category, amount, currency, payment_status
  from waiting_latest
union all
select p.raw_record_id, p.batch_id, 'published', p.row_hash, p.expense_id, p.property_id, p.expense_date, p.category, p.amount, p.currency, p.payment_status
  from published p
 where not exists (select 1 from waiting_latest w where w.expense_id = p.expense_id)
order by 1;
$$;

comment on function app.eff_expense(uuid) is
'Действующий набор расходов для проверок: строки пачки, затем pending/excluded/duplicate прежних пачек, затем опубликованные; приоритет по ключу (expense_id). origin: batch | pending | published.';
