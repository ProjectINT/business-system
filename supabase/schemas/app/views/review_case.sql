-- Случаи разбора (VALIDATION_PLAN.md, 7.5): незакрытые проблемы decide, сгруппированные по ключу случая
-- details ->> 'case_key'. Список случаев и прогресс для /review без отдельной таблицы.
-- Случай open, пока открыта хотя бы одна его проблема; resolved — когда решены все.
create view app.review_case with (security_invoker = true) as
select i.details ->> 'case_key' as case_key,
       i.entity,
       array_agg(distinct i.record_key order by i.record_key) as record_keys,
       array_agg(distinct i.rule_id order by i.rule_id) as rule_ids,
       count(*)::integer as issue_count,
       (count(*) filter (where i.status = 'open'))::integer as open_count,
       case when bool_or(i.status = 'open') then 'open' else 'resolved' end as status,
       min(i.opened_at) as opened_at,
       max(i.updated_at) as updated_at
  from app.dq_issue i
 where i.action = 'decide'
   and i.status <> 'closed'
 group by i.details ->> 'case_key', i.entity;

comment on view app.review_case is
'Случаи разбора: проблемы decide с общим case_key, статус open/resolved и прогресс по ним.';
