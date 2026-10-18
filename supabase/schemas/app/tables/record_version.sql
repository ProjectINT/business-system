-- История версий основных таблиц (аудит изменений). Пишет триггер app.capture_record_version,
-- поэтому в историю попадают и правки руками в обход импорта.
-- Только дописывание. Версия действует с recorded_at до recorded_at следующей версии той же записи.
create table app.record_version (
  version_id bigint generated always as identity primary key,
  entity app.source_entity not null,  -- имя основной таблицы
  record_key text not null,  -- естественный ключ; у правила комиссии 'V001|2026-09-01'
  version integer not null,
  operation text not null,
  data jsonb not null,  -- строка целиком; для delete — последнее состояние
  raw_record_id bigint references app.raw_record,  -- строка источника этой версии
  run_id uuid references app.dq_run,  -- запуск, который её опубликовал; null — правка вне импорта
  actor text not null,  -- app.actor из транзакции или роль базы
  recorded_at timestamptz not null default now(),
  constraint record_version_unique unique (entity, record_key, version),
  constraint record_version_positive check (version > 0),
  constraint record_version_operation_known check (operation in ('insert', 'update', 'delete'))
);

alter table app.record_version enable row level security;

create trigger record_version_append_only
before update or delete or truncate on app.record_version
for each statement execute function app.forbid_change();
