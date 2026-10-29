-- PoC синхронизации Google Sheets ⇄ Supabase (репозиторий legends-core). Временная схема,
-- с app.* не связана. Не публикуется через Data API (в config.toml [api].schemas её нет):
-- синхронизация на Vercel ходит в базу как postgres, владелец таблиц, через пулер.
-- Удаление: убрать supabase/schemas/sync_poc/ и npm run db:sync — миграция с drop schema sync_poc cascade.
create schema if not exists sync_poc;

comment on schema sync_poc is 'PoC синхронизации Google Sheets ⇄ Supabase. Временная, не связана с app.*';

revoke all on schema sync_poc from public, anon, authenticated;
