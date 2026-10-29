-- PoC синхронизации Google Sheets ⇄ Supabase (репозиторий legends-core). Временная схема, с app.* не
-- связана. Источник — supabase/schemas/sync_poc/, DDL сгенерирован npm run db:sync.
-- Удаление: убрать supabase/schemas/sync_poc/ и npm run db:sync (drop schema sync_poc cascade).
SET local check_function_bodies = off;

CREATE SCHEMA "sync_poc";

CREATE TABLE "sync_poc"."sync_run" (
  "id"          integer                  NOT NULL DEFAULT 1,
  "started_at"  timestamp with time zone,
  "finished_at" timestamp with time zone,
  "stats"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "sync_run_pkey" PRIMARY KEY (id),
  CONSTRAINT "sync_run_single_row" CHECK ((id = 1))
);

ALTER TABLE "sync_poc"."sync_run"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "sync_poc"."sync_state" (
  "row_id"     uuid                     NOT NULL,
  "sheet_hash" text,
  "db_version" integer                  NOT NULL,
  "synced_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sync_state_pkey" PRIMARY KEY (row_id)
);

ALTER TABLE "sync_poc"."sync_state"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "sync_poc"."villa" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"          text                     NOT NULL,
  "cluster"       text,
  "base_currency" text                     NOT NULL,
  "nightly_rate"  numeric,
  "status"        text,
  "version"       integer                  NOT NULL DEFAULT 1,
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at"    timestamp with time zone,
  CONSTRAINT "villa_base_currency_iso" CHECK ((base_currency ~ '^[A-Z]{3}$'::text)),
  CONSTRAINT "villa_pkey" PRIMARY KEY (id)
);

ALTER TABLE "sync_poc"."villa"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION sync_poc.bump_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$function$;

ALTER TABLE "sync_poc"."sync_state"
  ADD CONSTRAINT "sync_state_row_id_fkey" FOREIGN KEY (row_id) REFERENCES sync_poc.villa(id) ON DELETE CASCADE;

CREATE TRIGGER villa_bump_version
  BEFORE UPDATE ON sync_poc.villa
  FOR EACH ROW
  WHEN ((old.* IS DISTINCT FROM new.*))
  EXECUTE FUNCTION sync_poc.bump_version();

COMMENT ON FUNCTION "sync_poc"."bump_version"() IS 'Перед UPDATE с изменениями ставит version = прежняя версия + 1 и updated_at = now().';

COMMENT ON SCHEMA "sync_poc" IS 'PoC синхронизации Google Sheets ⇄ Supabase. Временная, не связана с app.*';

-- Ниже дописано руками: npm run db:sync этого не видит.

-- Права из supabase/schemas/sync_poc/ генератор не выписал: в теневой базе у public, anon и
-- authenticated нет прав на новую схему, менять нечего. Явно — на случай других прав по умолчанию
-- в базе, куда применяется миграция.
REVOKE ALL ON SCHEMA "sync_poc" FROM public, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA "sync_poc" FROM public, anon, authenticated;

-- Единственная строка sync_run: синхронизация делает UPDATE, а не upsert.
INSERT INTO "sync_poc"."sync_run" (id) VALUES (1);

-- Демо-данные для PoC: первая выгрузка в лист. В миграции, потому что seed.sql к удалённой базе
-- не применяется; схема временная.
INSERT INTO "sync_poc"."villa" (name, cluster, base_currency, nightly_rate, status) VALUES
  ('Villa Amara',  'Canggu',   'IDR', 4500000, 'active'),
  ('Villa Sora',   'Uluwatu',  'USD', 320,     'active'),
  ('Villa Kirana', 'Ubud',     'IDR', 2800000, 'maintenance'),
  ('Villa Lumi',   'Seminyak', 'USD', 410,     'active'),
  ('Villa Teja',   'Canggu',   'EUR', 290,     'inactive');
