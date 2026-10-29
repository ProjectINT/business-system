-- Виллы, которые синхронизируются с Google-таблицей. Строка изменилась в базе, если
-- version ≠ sync_state.db_version. Строки физически не удаляются: удаление — deleted_at.
create table sync_poc.villa (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cluster text,
  base_currency text not null,
  nightly_rate numeric,
  status text,
  version integer not null default 1,  -- растёт на каждый UPDATE с изменениями, меняет только триггер
  updated_at timestamptz not null default now(),  -- обновляет триггер
  deleted_at timestamptz,  -- мягкое удаление
  -- неверная валюта из листа падает здесь, текст ошибки синхронизация показывает в листе
  constraint villa_base_currency_iso check (base_currency ~ '^[A-Z]{3}$')
);

alter table sync_poc.villa enable row level security;

revoke all on sync_poc.villa from public, anon, authenticated;

create trigger villa_bump_version
before update on sync_poc.villa
for each row
when (old.* is distinct from new.*)
execute function sync_poc.bump_version();
