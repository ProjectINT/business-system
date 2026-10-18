-- Пачка импорта: одна загрузка полного набора файлов источника (пять сущностей) на дату среза.
-- Если все файлы совпадают по sha256 с последней загруженной пачкой, новая пачка получает статус
-- skipped и ссылку на ту пачку: строки не читаются, данные не меняются.
-- Проверки и публикацию по пачке выполняет app.dq_run. Запусков может быть несколько,
-- например с другой датой среза.
create table app.import_batch (
  batch_id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_ref text not null,  -- папка с CSV, id таблицы Google Sheets
  as_of date,  -- дата среза выгрузки; null — dq_run выберет её по правилу
  status text not null default 'loading',
  same_as_batch_id uuid references app.import_batch,  -- для skipped: пачка с теми же файлами
  started_by text not null,  -- пользователь или 'cli'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  constraint import_batch_source_kind_known check (source_kind in ('csv', 'google_sheets')),
  constraint import_batch_status_known check (status in ('loading', 'loaded', 'skipped', 'failed')),
  constraint import_batch_finished check ((status = 'loading') = (finished_at is null)),
  constraint import_batch_skipped_has_twin check ((status = 'skipped') = (same_as_batch_id is not null)),
  constraint import_batch_failed_has_error check ((status = 'failed') = (error is not null))
);

alter table app.import_batch enable row level security;
