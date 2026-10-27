-- Ставки комиссии управляющей компании по объектам. Ставка берётся на каждую ночь брони (PLAN.md, 7.2).
-- Ключ — вилла и дата начала: правило с той же датой начала обновляет старое как новую версию.
-- Пересечение периодов правил одной виллы не запрещено (решено 2026-10-18): правила приходят отдельными
-- файлами, и новое обычно приходит без укороченного старого. Пересечение помечает DQ-22 (review); на спорных
-- ночах ставки нет — политика commissionRuleOverlap: 'ambiguous' (решено 2026-10-27), и DQ-17 исключает бронь
-- с такой ночью, пока старое правило не закроют (resolveCommissionRule, CALCULATION_MODULE.md).
-- Происхождение и история версий — как в app.property.
create table app.commission_rule (
  property_id text not null references app.property,
  effective_from date not null,
  effective_to date,  -- включительно; null — правило действует бессрочно
  management_fee_rate numeric(6, 4) not null,  -- доля: 0.17 = 17%
  fee_basis text not null,
  note text,
  -- effective_to входит в период, поэтому '[]'; по period идёт запрос DQ-22
  period daterange generated always as (daterange(effective_from, effective_to, '[]')) stored,
  raw_record_id bigint not null references app.raw_record,
  row_hash text not null,
  constraint commission_rule_pkey primary key (property_id, effective_from),
  constraint commission_rule_period_ordered check (effective_to >= effective_from),
  constraint commission_rule_rate_bounds check (management_fee_rate >= 0 and management_fee_rate < 1),
  -- другую базу расчётный движок не умеет; новая база — осознанное изменение схемы и движка
  constraint commission_rule_fee_basis_known check (fee_basis in ('gross_booking_value'))
);

alter table app.commission_rule enable row level security;

create trigger commission_rule_history
after insert or update or delete on app.commission_rule
for each row execute function app.capture_record_version('property_id', 'effective_from');
