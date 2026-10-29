-- Версия строки sync_poc.villa для синхронизации с листом. Триггер before update, for each row,
-- только при фактических изменениях (when old.* is distinct from new.*):
--   * before — update ... returning version сразу возвращает новую версию, и синхронизация пишет её
--     в sync_state в той же транзакции;
--   * версия считается от old.version, значение version из запроса игнорируется;
--   * update без изменений триггер не вызывает, версия не растёт: повторная запись тех же значений
--     не выглядит как новое изменение в базе.
create or replace function sync_poc.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

comment on function sync_poc.bump_version() is
'Перед UPDATE с изменениями ставит version = прежняя версия + 1 и updated_at = now().';
