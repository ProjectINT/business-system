-- Пачка импорта: одна загрузка, от одного до пяти файлов, по одному на сущность (IMPORT_PLAN.md, 3).
-- Файлы одной выгрузки источника приходят в разное время, поэтому пачка из одного файла — обычный случай.
-- Файл — не полный снимок сущности: строк, которых в нём нет, никто не удаляет и не помечает.
-- Повтор проверяется по файлу (import_file.status = skipped). Если пропущены все файлы пачки, пачка
-- получает skipped и ссылку на пачку последнего из них: строки не читаются, данные не меняются.
-- Проверки и публикацию выполняет app.dq_run по действующему набору данных (VALIDATION_PLAN.md, 2).
-- Статусы урезанной синхронной версии (IMPORT_PLAN.md, 0 и 11):
--   loading      — файлы читаются, идут проверки и публикация;
--   needs_review — записи без сомнений опубликованы, брони случаев decide и платежи по ним ждут решения
--                  человека; пачка закрывается loaded, когда у неё не осталось строк pending;
--   loaded, skipped, failed — конечные.
-- Статусы очереди (uploading, queued, processing) появятся вместе с очередью import_job.
create table app.import_batch (
  batch_id uuid primary key default gen_random_uuid(),
  source_kind text not null,
  source_ref text not null,  -- папка с CSV, id таблицы Google Sheets
  as_of date,  -- дата среза выгрузки; null — dq_run выберет её по правилу
  status text not null default 'loading',
  same_as_batch_id uuid references app.import_batch,  -- для skipped: пачка, куда загружен последний из пропущенных файлов
  started_by text not null,  -- пользователь или 'cli'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  constraint import_batch_source_kind_known check (source_kind in ('csv', 'google_sheets')),
  constraint import_batch_status_known check (status in ('loading', 'needs_review', 'loaded', 'skipped', 'failed')),
  -- пачка не завершена, пока идёт загрузка или её случаи ждут решения
  constraint import_batch_finished check ((status in ('loading', 'needs_review')) = (finished_at is null)),
  constraint import_batch_skipped_has_twin check ((status = 'skipped') = (same_as_batch_id is not null)),
  constraint import_batch_failed_has_error check ((status = 'failed') = (error is not null))
);

alter table app.import_batch enable row level security;
