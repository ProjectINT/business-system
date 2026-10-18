-- Защита таблиц «только дописывание»: сырые строки, журнал проверок, решения, история версий.
-- Вешается триггером уровня оператора на UPDATE, DELETE и TRUNCATE. Ошибка возникает при любой
-- попытке, даже если под условие не попала ни одна строка. Обойти может только владелец таблицы,
-- отключив триггер.
create or replace function app.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Table %.% is append-only: % is not allowed', tg_table_schema, tg_table_name, tg_op
    using hint = 'Write a new row instead of changing history';
end;
$$;

comment on function app.forbid_change() is
'Запрещает UPDATE, DELETE и TRUNCATE в таблицах «только дописывание»: история не переписывается.';
