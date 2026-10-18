-- История версий основных таблиц для аудита: property, commission_rule, reservation, payment, expense.
-- Триггер after insert or update or delete, for each row. Аргументы триггера — колонки естественного
-- ключа, значения склеиваются через '|': у правила комиссии ключ 'V001|2026-09-01'.
-- Кто и каким запуском изменил запись, берётся из настроек транзакции:
--   set local app.actor = 'import:cli';
--   set local app.run_id = '<uuid из dq_run>';
-- Без app.actor пишется роль базы, без app.run_id — null: так видны правки руками в обход импорта.
create or replace function app.capture_record_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  row_data         jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  record_key_value text;
begin
  -- UPDATE без фактических изменений новую версию не создаёт
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return null;
  end if;

  select string_agg(row_data ->> a.col, '|' order by a.ord)
    into record_key_value
    from unnest(tg_argv) with ordinality as a(col, ord);

  -- конкурентные изменения одной записи сериализует блокировка её строки в основной таблице
  insert into app.record_version (entity, record_key, version, operation, data, raw_record_id, run_id, actor)
  select tg_table_name,
         record_key_value,
         coalesce(max(v.version), 0) + 1,
         lower(tg_op),
         row_data,
         (row_data ->> 'raw_record_id')::bigint,
         nullif(current_setting('app.run_id', true), '')::uuid,
         coalesce(nullif(current_setting('app.actor', true), ''), current_user)
    from app.record_version v
   where v.entity = tg_table_name::text
     and v.record_key = record_key_value;

  return null;
end;
$$;

comment on function app.capture_record_version() is
'Пишет версию записи основной таблицы в app.record_version: данные целиком, строка источника, запуск, автор.';
