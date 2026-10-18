-- btree_gist нужен, чтобы в EXCLUDE сравнивать text (property_id) через "=" рядом с daterange.
-- В Supabase расширения ставятся в схему extensions.
create extension if not exists btree_gist with schema extensions;
