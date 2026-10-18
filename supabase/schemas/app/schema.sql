-- Схема приложения. Не публикуется через Data API (в config.toml [api].schemas её нет),
-- сервер ходит в базу напрямую.
create schema if not exists app;
