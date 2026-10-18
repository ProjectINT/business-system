-- Ставки комиссии управляющей компании по объектам. Ставка для брони берётся по дате заезда (PLAN.md, 7.2).
-- Происхождение и история версий — как в app.property.
create table app.commission_rule (
  property_id text not null references app.property,
  effective_from date not null,
  effective_to date,  -- включительно; null — правило действует бессрочно
  management_fee_rate numeric(6, 4) not null,  -- доля: 0.17 = 17%
  fee_basis text not null,
  note text,
  -- effective_to входит в период, поэтому '[]'
  period daterange generated always as (daterange(effective_from, effective_to, '[]')) stored,
  raw_record_id bigint not null references app.raw_record,
  row_hash text not null,
  constraint commission_rule_pkey primary key (property_id, effective_from),
  constraint commission_rule_period_ordered check (effective_to >= effective_from),
  constraint commission_rule_rate_bounds check (management_fee_rate >= 0 and management_fee_rate < 1),
  -- другую базу расчётный движок не умеет; новая база — осознанное изменение схемы и движка
  constraint commission_rule_fee_basis_known check (fee_basis in ('gross_booking_value')),
  -- у объекта на любую дату не больше одной ставки (DQ-22). Ошибка 23P01.
  constraint commission_rule_no_overlap exclude using gist (property_id with =, period with &&)
);

alter table app.commission_rule enable row level security;

create trigger commission_rule_history
after insert or update or delete on app.commission_rule
for each row execute function app.capture_record_version('property_id', 'effective_from');
