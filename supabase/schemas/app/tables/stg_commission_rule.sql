-- Staging правил комиссии: типизированные строки пачки без бизнес-ограничений.
-- Нераспознанное значение — null, исходный текст в raw_record.payload, ошибку фиксирует DQ-03.
-- Пересечение периодов правил одного объекта измеряет DQ-22 запросом по period.
create table app.stg_commission_rule (
  raw_record_id bigint primary key,
  batch_id uuid not null,
  property_id text,
  effective_from date,
  effective_to date,
  management_fee_rate numeric,
  fee_basis text,
  note text,
  -- effective_to входит в период, поэтому '[]'. null, если начало не разобралось или конец раньше
  -- начала: daterange вызвал бы ошибку или пересекался бы со всем подряд
  period daterange generated always as (
    case
      when effective_from is not null and (effective_to is null or effective_to >= effective_from)
        then daterange(effective_from, effective_to, '[]')
    end
  ) stored,
  constraint stg_commission_rule_raw_record_fkey
  foreign key (raw_record_id, batch_id) references app.raw_record (raw_record_id, batch_id)
);

create index stg_commission_rule_period on app.stg_commission_rule using gist (batch_id, property_id, period);

alter table app.stg_commission_rule enable row level security;
