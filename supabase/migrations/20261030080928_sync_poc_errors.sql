-- Служебные таблицы PoC синхронизации Google Sheets → sync_poc.villa (репозиторий legends-core):
-- sync_error — проблемы со строками листа, sheet_read — сырые ответы Google Sheets API.
-- Источник — supabase/schemas/sync_poc/tables/, DDL сгенерирован npm run db:sync.
CREATE TABLE "sync_poc"."sheet_read" (
  "id"             bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "read_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "spreadsheet_id" text                     NOT NULL,
  "tab"            text                     NOT NULL,
  "response"       jsonb                    NOT NULL,
  "row_count"      integer                  NOT NULL,
  "error"          text,
  CONSTRAINT "sheet_read_pkey" PRIMARY KEY (id)
);

ALTER TABLE "sync_poc"."sheet_read"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "sync_poc"."sync_error" (
  "id"            bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "row_key"       text                     NOT NULL,
  "sheet_row"     integer,
  "kind"          text                     NOT NULL,
  "message"       text                     NOT NULL,
  "sheet_values"  jsonb,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at"   timestamp with time zone,
  CONSTRAINT "sync_error_kind_check"
    CHECK ((kind = ANY (ARRAY['duplicate_id'::text, 'unknown_id'::text, 'deleted_in_db'::text, 'validation'::text, 'constraint'::text, 'conflict'::text]))),
  CONSTRAINT "sync_error_pkey" PRIMARY KEY (id)
);

ALTER TABLE "sync_poc"."sync_error"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX sheet_read_read_at ON sync_poc.sheet_read USING btree (read_at);

CREATE UNIQUE INDEX sync_error_open_key ON sync_poc.sync_error USING btree (row_key, kind, message)
  WHERE (resolved_at IS NULL);

-- Ниже дописано руками: npm run db:sync этого не видит.

-- Права из supabase/schemas/sync_poc/ генератор не выписал (в теневой базе отзывать нечего). Явно — на
-- случай других прав по умолчанию в базе, куда применяется миграция.
REVOKE ALL ON "sync_poc"."sync_error" FROM public, anon, authenticated;
REVOKE ALL ON "sync_poc"."sheet_read" FROM public, anon, authenticated;
