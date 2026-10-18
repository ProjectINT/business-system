-- Собственники. В источнике есть только owner_id в properties.csv, таблица заполняется оттуда.
-- Нужна как опора для будущих выплат и для доступа собственника к своим объектам (RLS).
create table app.owner (
  owner_id text primary key,
  created_at timestamptz not null default now(),
  constraint owner_id_format check (owner_id ~ '^O\d{3}$')
);

alter table app.owner enable row level security;
