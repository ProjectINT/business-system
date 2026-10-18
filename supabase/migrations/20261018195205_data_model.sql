SET local check_function_bodies = off;

CREATE SCHEMA "app";

CREATE EXTENSION "btree_gist" SCHEMA "extensions";

CREATE TABLE "app"."commission_rule" (
  "property_id"         text         NOT NULL,
  "effective_from"      date         NOT NULL,
  "effective_to"        date,
  "management_fee_rate" numeric(6,4) NOT NULL,
  "fee_basis"           text         NOT NULL,
  "note"                text,
  "raw_record_id"       bigint       NOT NULL,
  "row_hash"            text         NOT NULL,
  CONSTRAINT "commission_rule_fee_basis_known" CHECK ((fee_basis = 'gross_booking_value'::text)),
  CONSTRAINT "commission_rule_period_ordered" CHECK ((effective_to >= effective_from)),
  CONSTRAINT "commission_rule_pkey" PRIMARY KEY (property_id, effective_from),
  CONSTRAINT "commission_rule_rate_bounds" CHECK (((management_fee_rate >= (0)::numeric) AND (management_fee_rate < (1)::numeric)))
);

ALTER TABLE "app"."commission_rule"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."dq_check_result" (
  "result_id"     bigint        GENERATED ALWAYS AS IDENTITY NOT NULL,
  "run_id"        uuid          NOT NULL,
  "rule_id"       text          NOT NULL,
  "rule_version"  integer       NOT NULL,
  "raw_record_id" bigint,
  "file_id"       bigint,
  "record_key"    text,
  "outcome"       text          NOT NULL,
  "action"        text          NOT NULL,
  "reason"        text,
  "details"       jsonb,
  "related_keys"  text[],
  "amount_idr"    numeric(18,2),
  CONSTRAINT "dq_check_result_action_known" CHECK ((action = ANY (ARRAY['duplicate'::text, 'exclude'::text, 'decide'::text, 'hold'::text, 'review'::text, 'info'::text]))),
  CONSTRAINT "dq_check_result_file_unique" UNIQUE (run_id, rule_id, file_id),
  CONSTRAINT "dq_check_result_one_unit" CHECK ((num_nonnulls(raw_record_id, file_id) = 1)),
  CONSTRAINT "dq_check_result_outcome_known" CHECK ((outcome = ANY (ARRAY['pass'::text, 'fail'::text, 'skip'::text, 'error'::text]))),
  CONSTRAINT "dq_check_result_pkey" PRIMARY KEY (result_id),
  CONSTRAINT "dq_check_result_row_unique" UNIQUE (run_id, rule_id, raw_record_id),
  CONSTRAINT "dq_check_result_rule_id_format" CHECK ((rule_id ~ '^DQ-\d{2}$'::text)),
  CONSTRAINT "dq_check_result_skip_has_reason" CHECK (((outcome <> 'skip'::text) OR (reason IS NOT NULL)))
);

ALTER TABLE "app"."dq_check_result"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."dq_issue" (
  "issue_id"      bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "rule_id"       text                     NOT NULL,
  "record_key"    text                     NOT NULL,
  "action"        text                     NOT NULL,
  "status"        text                     NOT NULL DEFAULT 'open'::text,
  "row_hash"      text                     NOT NULL,
  "details"       jsonb,
  "related_keys"  text[],
  "first_run_id"  uuid                     NOT NULL,
  "last_run_id"   uuid                     NOT NULL,
  "closed_run_id" uuid,
  "opened_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dq_issue_action_known" CHECK ((action = ANY (ARRAY['decide'::text, 'review'::text]))),
  CONSTRAINT "dq_issue_closed_by_run" CHECK (((status = 'closed'::text) = (closed_run_id IS NOT NULL))),
  CONSTRAINT "dq_issue_decide_has_case" CHECK (((action <> 'decide'::text) OR (details ? 'case_key'::text))),
  CONSTRAINT "dq_issue_pkey" PRIMARY KEY (issue_id),
  CONSTRAINT "dq_issue_rule_id_format" CHECK ((rule_id ~ '^DQ-\d{2}$'::text)),
  CONSTRAINT "dq_issue_status_known" CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'closed'::text])))
);

ALTER TABLE "app"."dq_issue"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."dq_record_verdict" (
  "run_id"                uuid    NOT NULL,
  "raw_record_id"         bigint  NOT NULL,
  "record_key"            text,
  "status"                text    NOT NULL,
  "rule_ids"              text[]  NOT NULL DEFAULT '{}'::text[],
  "decision_id"           bigint,
  "admitted_to_occupancy" boolean,
  CONSTRAINT "dq_record_verdict_pkey" PRIMARY KEY (run_id, raw_record_id),
  CONSTRAINT "dq_record_verdict_reasons" CHECK (
CASE status
    WHEN 'superseded'::text THEN ((cardinality(rule_ids) = 0) AND (decision_id IS NULL))
    WHEN 'clean'::text THEN (cardinality(rule_ids) = 0)
    ELSE ((cardinality(rule_ids) > 0) OR (decision_id IS NOT NULL))
END),
  CONSTRAINT "dq_record_verdict_status_known"
    CHECK ((status = ANY (ARRAY['clean'::text, 'review'::text, 'pending'::text, 'excluded'::text, 'duplicate'::text, 'superseded'::text])))
);

ALTER TABLE "app"."dq_record_verdict"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."dq_run" (
  "run_id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "batch_id"        uuid,
  "as_of"           date                     NOT NULL,
  "as_of_defaulted" boolean                  NOT NULL,
  "code_version"    text                     NOT NULL,
  "rules"           jsonb                    NOT NULL,
  "status"          text                     NOT NULL DEFAULT 'running'::text,
  "started_by"      text                     NOT NULL,
  "started_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at"     timestamp with time zone,
  "error"           text,
  "summary"         jsonb,
  CONSTRAINT "dq_run_failed_has_error" CHECK (((status = 'failed'::text) = (error IS NOT NULL))),
  CONSTRAINT "dq_run_finished" CHECK (((status = 'running'::text) = (finished_at IS NULL))),
  CONSTRAINT "dq_run_pkey" PRIMARY KEY (run_id),
  CONSTRAINT "dq_run_rules_array" CHECK ((jsonb_typeof(rules) = 'array'::text)),
  CONSTRAINT "dq_run_status_known" CHECK ((status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text])))
);

ALTER TABLE "app"."dq_run"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."expense" (
  "expense_id"     text          NOT NULL,
  "property_id"    text          NOT NULL,
  "expense_date"   date          NOT NULL,
  "category"       text          NOT NULL,
  "amount"         numeric(18,2) NOT NULL,
  "currency"       text          NOT NULL,
  "payment_status" text          NOT NULL,
  "raw_record_id"  bigint        NOT NULL,
  "row_hash"       text          NOT NULL,
  CONSTRAINT "expense_amount_positive" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "expense_id_format" CHECK ((expense_id ~ '^E\d{4}$'::text)),
  CONSTRAINT "expense_payment_status_known" CHECK ((payment_status = ANY (ARRAY['paid'::text, 'pending'::text]))),
  CONSTRAINT "expense_pkey" PRIMARY KEY (expense_id)
);

ALTER TABLE "app"."expense"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."import_batch" (
  "batch_id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_kind"      text                     NOT NULL,
  "source_ref"       text                     NOT NULL,
  "as_of"            date,
  "status"           text                     NOT NULL DEFAULT 'loading'::text,
  "same_as_batch_id" uuid,
  "started_by"       text                     NOT NULL,
  "started_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at"      timestamp with time zone,
  "error"            text,
  CONSTRAINT "import_batch_failed_has_error" CHECK (((status = 'failed'::text) = (error IS NOT NULL))),
  CONSTRAINT "import_batch_finished" CHECK (((status = ANY (ARRAY['loading'::text, 'needs_review'::text])) = (finished_at IS NULL))),
  CONSTRAINT "import_batch_pkey" PRIMARY KEY (batch_id),
  CONSTRAINT "import_batch_skipped_has_twin" CHECK (((status = 'skipped'::text) = (same_as_batch_id IS NOT NULL))),
  CONSTRAINT "import_batch_source_kind_known" CHECK ((source_kind = ANY (ARRAY['csv'::text, 'google_sheets'::text]))),
  CONSTRAINT "import_batch_status_known" CHECK ((status = ANY (ARRAY['loading'::text, 'needs_review'::text, 'loaded'::text, 'skipped'::text, 'failed'::text])))
);

ALTER TABLE "app"."import_batch"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."import_file" (
  "file_id"         bigint  GENERATED ALWAYS AS IDENTITY NOT NULL,
  "batch_id"        uuid    NOT NULL,
  "file_name"       text    NOT NULL,
  "file_sha256"     text    NOT NULL,
  "byte_size"       integer NOT NULL,
  "header"          text[]  NOT NULL,
  "row_count"       integer NOT NULL,
  "status"          text    NOT NULL,
  "same_as_file_id" bigint,
  CONSTRAINT "import_file_batch_key" UNIQUE (file_id, batch_id),
  CONSTRAINT "import_file_counts_not_negative" CHECK (((byte_size >= 0) AND (row_count >= 0))),
  CONSTRAINT "import_file_pkey" PRIMARY KEY (file_id),
  CONSTRAINT "import_file_sha256_hex" CHECK ((file_sha256 ~ '^[0-9a-f]{64}$'::text)),
  CONSTRAINT "import_file_skipped_has_twin" CHECK (((status = 'skipped'::text) = (same_as_file_id IS NOT NULL))),
  CONSTRAINT "import_file_status_known" CHECK ((status = ANY (ARRAY['loaded'::text, 'skipped'::text])))
);

ALTER TABLE "app"."import_file"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."occupancy" (
  "reservation_id"  text                     NOT NULL,
  "property_id"     text                     NOT NULL,
  "stay"            daterange                NOT NULL,
  "admitted_run_id" uuid                     NOT NULL,
  "decision_id"     bigint,
  "admitted_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "occupancy_pkey" PRIMARY KEY (reservation_id),
  CONSTRAINT "occupancy_stay_bounded" CHECK (((NOT isempty(stay)) AND (NOT lower_inf(stay)) AND (NOT upper_inf(stay))))
);

ALTER TABLE "app"."occupancy"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."owner" (
  "owner_id"   text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "owner_id_format" CHECK ((owner_id ~ '^O\d{3}$'::text)),
  CONSTRAINT "owner_pkey" PRIMARY KEY (owner_id)
);

ALTER TABLE "app"."owner"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."payment" (
  "payment_id"     text          NOT NULL,
  "reservation_id" text          NOT NULL,
  "property_id"    text          NOT NULL,
  "payment_date"   date          NOT NULL,
  "amount"         numeric(18,2) NOT NULL,
  "currency"       text          NOT NULL,
  "status"         text          NOT NULL,
  "raw_record_id"  bigint        NOT NULL,
  "row_hash"       text          NOT NULL,
  CONSTRAINT "payment_amount_not_negative" CHECK ((amount >= (0)::numeric)),
  CONSTRAINT "payment_id_format" CHECK ((payment_id ~ '^P\d{4}$'::text)),
  CONSTRAINT "payment_pkey" PRIMARY KEY (payment_id),
  CONSTRAINT "payment_status_known" CHECK ((status = 'received'::text))
);

ALTER TABLE "app"."payment"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."property" (
  "property_id"   text   NOT NULL,
  "property_name" text   NOT NULL,
  "cluster"       text   NOT NULL,
  "owner_id"      text   NOT NULL,
  "base_currency" text   NOT NULL,
  "raw_record_id" bigint NOT NULL,
  "row_hash"      text   NOT NULL,
  CONSTRAINT "property_base_currency_iso" CHECK ((base_currency ~ '^[A-Z]{3}$'::text)),
  CONSTRAINT "property_currency_key" UNIQUE (property_id, base_currency),
  CONSTRAINT "property_id_format" CHECK ((property_id ~ '^V\d{3}$'::text)),
  CONSTRAINT "property_pkey" PRIMARY KEY (property_id)
);

ALTER TABLE "app"."property"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."raw_record" (
  "raw_record_id" bigint  GENERATED ALWAYS AS IDENTITY NOT NULL,
  "batch_id"      uuid    NOT NULL,
  "file_id"       bigint  NOT NULL,
  "line_no"       integer NOT NULL,
  "record_key"    text,
  "payload"       jsonb   NOT NULL,
  "row_hash"      text    NOT NULL,
  CONSTRAINT "raw_record_batch_key" UNIQUE (raw_record_id, batch_id),
  CONSTRAINT "raw_record_line_after_header" CHECK ((line_no >= 2)),
  CONSTRAINT "raw_record_line_unique" UNIQUE (file_id, line_no),
  CONSTRAINT "raw_record_payload_object" CHECK ((jsonb_typeof(payload) = 'object'::text)),
  CONSTRAINT "raw_record_pkey" PRIMARY KEY (raw_record_id),
  CONSTRAINT "raw_record_row_hash_hex" CHECK ((row_hash ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE "app"."raw_record"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."record_version" (
  "version_id"    bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "record_key"    text                     NOT NULL,
  "version"       integer                  NOT NULL,
  "operation"     text                     NOT NULL,
  "data"          jsonb                    NOT NULL,
  "raw_record_id" bigint,
  "run_id"        uuid,
  "actor"         text                     NOT NULL,
  "recorded_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "record_version_operation_known" CHECK ((operation = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text]))),
  CONSTRAINT "record_version_pkey" PRIMARY KEY (version_id),
  CONSTRAINT "record_version_positive" CHECK ((version > 0))
);

ALTER TABLE "app"."record_version"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."reservation" (
  "reservation_id"        text          NOT NULL,
  "property_id"           text          NOT NULL,
  "check_in"              date          NOT NULL,
  "check_out"             date          NOT NULL,
  "status"                text          NOT NULL,
  "gross_booking_value"   numeric(18,2) NOT NULL,
  "currency"              text          NOT NULL,
  "ota_fee"               numeric(18,2) NOT NULL,
  "refund_amount"         numeric(18,2) NOT NULL,
  "channel"               text          NOT NULL,
  "updated_at"            date          NOT NULL,
  "origin_reservation_id" text,
  "raw_record_id"         bigint        NOT NULL,
  "row_hash"              text          NOT NULL,
  CONSTRAINT "reservation_channel_known" CHECK ((channel = ANY (ARRAY['OTA'::text, 'Direct'::text]))),
  CONSTRAINT "reservation_gbv_positive" CHECK ((gross_booking_value > (0)::numeric)),
  CONSTRAINT "reservation_id_format" CHECK ((reservation_id ~ '^R\d{4}$'::text)),
  CONSTRAINT "reservation_nights_positive" CHECK ((check_out > check_in)),
  CONSTRAINT "reservation_origin_not_self" CHECK ((origin_reservation_id <> reservation_id)),
  CONSTRAINT "reservation_pkey" PRIMARY KEY (reservation_id),
  CONSTRAINT "reservation_refund_bounds" CHECK (((refund_amount >= (0)::numeric) AND (refund_amount <= gross_booking_value))),
  CONSTRAINT "reservation_status_known" CHECK ((status = ANY (ARRAY['confirmed'::text, 'modified'::text, 'cancelled'::text])))
);

ALTER TABLE "app"."reservation"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."review_decision" (
  "decision_id" bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "issue_id"    bigint,
  "case_key"    text,
  "record_key"  text                     NOT NULL,
  "decision"    text                     NOT NULL,
  "row_hash"    text                     NOT NULL,
  "payload"     jsonb,
  "comment"     text                     NOT NULL,
  "decided_by"  text                     NOT NULL,
  "decided_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "review_decision_comment_present" CHECK ((btrim(comment) <> ''::text)),
  CONSTRAINT "review_decision_known" CHECK ((decision = ANY (ARRAY['accept'::text, 'finance_only'::text, 'exclude'::text, 'keep_published'::text]))),
  CONSTRAINT "review_decision_payload_object" CHECK (((payload IS NULL) OR (jsonb_typeof(payload) = 'object'::text))),
  CONSTRAINT "review_decision_pkey" PRIMARY KEY (decision_id),
  CONSTRAINT "review_decision_target" CHECK (((case_key IS NOT NULL) OR (issue_id IS NOT NULL)))
);

ALTER TABLE "app"."review_decision"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."stg_commission_rule" (
  "raw_record_id"       bigint  NOT NULL,
  "batch_id"            uuid    NOT NULL,
  "property_id"         text,
  "effective_from"      date,
  "effective_to"        date,
  "management_fee_rate" numeric,
  "fee_basis"           text,
  "note"                text,
  CONSTRAINT "stg_commission_rule_pkey" PRIMARY KEY (raw_record_id)
);

ALTER TABLE "app"."stg_commission_rule"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."stg_expense" (
  "raw_record_id"  bigint  NOT NULL,
  "batch_id"       uuid    NOT NULL,
  "expense_id"     text,
  "property_id"    text,
  "expense_date"   date,
  "category"       text,
  "amount"         numeric,
  "currency"       text,
  "payment_status" text,
  CONSTRAINT "stg_expense_pkey" PRIMARY KEY (raw_record_id)
);

ALTER TABLE "app"."stg_expense"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."stg_payment" (
  "raw_record_id"  bigint  NOT NULL,
  "batch_id"       uuid    NOT NULL,
  "payment_id"     text,
  "reservation_id" text,
  "property_id"    text,
  "payment_date"   date,
  "amount"         numeric,
  "currency"       text,
  "status"         text,
  CONSTRAINT "stg_payment_pkey" PRIMARY KEY (raw_record_id)
);

ALTER TABLE "app"."stg_payment"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."stg_property" (
  "raw_record_id" bigint NOT NULL,
  "batch_id"      uuid   NOT NULL,
  "property_id"   text,
  "property_name" text,
  "cluster"       text,
  "owner_id"      text,
  "base_currency" text,
  CONSTRAINT "stg_property_pkey" PRIMARY KEY (raw_record_id)
);

ALTER TABLE "app"."stg_property"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "app"."stg_reservation" (
  "raw_record_id"       bigint  NOT NULL,
  "batch_id"            uuid    NOT NULL,
  "reservation_id"      text,
  "property_id"         text,
  "check_in"            date,
  "check_out"           date,
  "status"              text,
  "gross_booking_value" numeric,
  "currency"            text,
  "ota_fee"             numeric,
  "refund_amount"       numeric,
  "channel"             text,
  "updated_at"          date,
  CONSTRAINT "stg_reservation_pkey" PRIMARY KEY (raw_record_id)
);

ALTER TABLE "app"."stg_reservation"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "app"."commission_rule"
  ADD COLUMN "period" daterange GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[]'::text)) STORED;

ALTER TABLE "app"."reservation"
  ADD COLUMN "stay" daterange GENERATED ALWAYS AS (daterange(check_in, check_out, '[)'::text)) STORED;

ALTER TABLE "app"."reservation"
  ADD COLUMN "nights" integer GENERATED ALWAYS AS ((check_out - check_in)) STORED;

ALTER TABLE "app"."stg_commission_rule"
  ADD COLUMN "period" daterange GENERATED ALWAYS AS (
CASE
    WHEN ((effective_from IS NOT NULL) AND ((effective_to IS NULL) OR (effective_to >= effective_from))) THEN daterange(effective_from, effective_to, '[]'::text)
    ELSE NULL::daterange
END) STORED;

ALTER TABLE "app"."stg_reservation"
  ADD COLUMN "stay" daterange GENERATED ALWAYS AS (
CASE
    WHEN (check_out > check_in) THEN daterange(check_in, check_out, '[)'::text)
    ELSE NULL::daterange
END) STORED;

ALTER TABLE "app"."stg_reservation"
  ADD COLUMN "nights" integer GENERATED ALWAYS AS ((check_out - check_in)) STORED;

CREATE DOMAIN "app"."source_entity" AS text CONSTRAINT "source_entity_check"
  CHECK ((VALUE = ANY (ARRAY['property'::text, 'commission_rule'::text, 'reservation'::text, 'payment'::text, 'expense'::text])));

ALTER TABLE "app"."dq_check_result"
  ADD COLUMN "entity" app.source_entity NOT NULL;

ALTER TABLE "app"."dq_issue"
  ADD COLUMN "entity" app.source_entity NOT NULL;

ALTER TABLE "app"."dq_record_verdict"
  ADD COLUMN "entity" app.source_entity NOT NULL;

ALTER TABLE "app"."import_file"
  ADD COLUMN "entity" app.source_entity NOT NULL;

ALTER TABLE "app"."record_version"
  ADD COLUMN "entity" app.source_entity NOT NULL;

CREATE OR REPLACE FUNCTION app.capture_record_version()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  row_data         jsonb := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  record_key_value text;
begin
  -- UPDATE без фактических изменений новую версию не создаёт
  if tg_op = 'UPDATE' and to_jsonb(new) = to_jsonb(old) then
    return null;
  end if;

  select string_agg(row_data ->> a.col, '|' order by a.ord)
    into record_key_value
    from unnest(tg_argv) with ordinality as a(col, ord);

  -- конкурентные изменения одной записи сериализует блокировка её строки в основной таблице
  insert into app.record_version (entity, record_key, version, operation, data, raw_record_id, run_id, actor)
  select tg_table_name,
         record_key_value,
         coalesce(max(v.version), 0) + 1,
         lower(tg_op),
         row_data,
         (row_data ->> 'raw_record_id')::bigint,
         nullif(current_setting('app.run_id', true), '')::uuid,
         coalesce(nullif(current_setting('app.actor', true), ''), current_user)
    from app.record_version v
   where v.entity = tg_table_name::text
     and v.record_key = record_key_value;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION app.check_property_availability()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  conflict record;
begin
  -- 1. Проверка нужна при INSERT и при UPDATE, если поменялась вилла или даты.
  --    UPDATE OF срабатывает и тогда, когда колонка есть в SET, но значение не изменилось.
  if tg_op = 'UPDATE'
     and new.property_id is not distinct from old.property_id
     and new.stay is not distinct from old.stay then
    return new;
  end if;

  -- 2. Ищем пересечение. На диапазонах '[)' оператор && не считает пересечением
  --    выезд и заезд в один день. Запрос идёт по GiST-индексу ограничения occupancy_no_overlap.
  select o.reservation_id,
         o.stay,
         upper(o.stay * new.stay) - lower(o.stay * new.stay) as common_nights
    into conflict
    from app.occupancy o
   where o.property_id = new.property_id
     and o.stay && new.stay
     -- при UPDATE старая версия строки ещё в таблице, её не считаем
     and (tg_op = 'INSERT' or o.reservation_id <> old.reservation_id)
   order by lower(o.stay), o.reservation_id
   limit 1;

  if found then
    raise exception 'Villa % is not available for reservation % %: overlaps reservation % %, % night(s) in common',
      new.property_id, new.reservation_id, new.stay,
      conflict.reservation_id, conflict.stay, conflict.common_nights
      using errcode    = 'exclusion_violation',  -- 23P01, тот же код, что у EXCLUDE
            schema     = 'app',
            table      = 'occupancy',
            constraint = 'occupancy_no_overlap',
            hint       = 'Resolve the overlap in the review queue before admitting the reservation';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION app.eff_commission_rule (
  p_batch_id uuid
)
  RETURNS TABLE (
    raw_record_id       bigint,
    batch_id            uuid,
    origin              text,
    row_hash            text,
    property_id         text,
    effective_from      date,
    effective_to        date,
    management_fee_rate numeric,
    fee_basis           text,
    note                text,
    period              daterange
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
with latest_verdict as (
  select distinct on (v.raw_record_id) v.raw_record_id, v.status
    from app.dq_record_verdict v
    join app.dq_run r on r.run_id = v.run_id
   where r.status <> 'failed'
   order by v.raw_record_id, r.started_at desc
),
batch_rows as (
  select s.raw_record_id, s.batch_id, rr.row_hash, s.property_id, s.effective_from, s.effective_to, s.management_fee_rate, s.fee_basis, s.note, s.period
    from app.stg_commission_rule s
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
   where s.batch_id = p_batch_id
),
published as (
  select t.raw_record_id, rr.batch_id, t.row_hash, b.started_at, t.property_id, t.effective_from, t.effective_to, t.management_fee_rate, t.fee_basis, t.note, t.period
    from app.commission_rule t
    join app.raw_record rr on rr.raw_record_id = t.raw_record_id
    join app.import_batch b on b.batch_id = rr.batch_id
   where not exists (select 1 from batch_rows x where x.property_id = t.property_id and x.effective_from = t.effective_from)
),
waiting as (
  select s.raw_record_id, s.batch_id, rr.row_hash, b.started_at, s.property_id, s.effective_from, s.effective_to, s.management_fee_rate, s.fee_basis, s.note, s.period
    from app.stg_commission_rule s
    join latest_verdict lv on lv.raw_record_id = s.raw_record_id
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
    join app.import_batch b on b.batch_id = s.batch_id
   where lv.status in ('pending', 'excluded', 'duplicate')
     and s.batch_id is distinct from p_batch_id
     and not exists (select 1 from batch_rows x where x.property_id = s.property_id and x.effective_from = s.effective_from)
     and not exists (select 1 from published p where p.property_id = s.property_id and p.effective_from = s.effective_from and p.started_at >= b.started_at)
),
waiting_latest as (
  select w.*
    from waiting w
   where w.property_id is null or w.effective_from is null
      or w.started_at = (select max(w2.started_at) from waiting w2 where w2.property_id = w.property_id and w2.effective_from = w.effective_from)
)
select raw_record_id, batch_id, 'batch', row_hash, property_id, effective_from, effective_to, management_fee_rate, fee_basis, note, period
  from batch_rows
union all
select raw_record_id, batch_id, 'pending', row_hash, property_id, effective_from, effective_to, management_fee_rate, fee_basis, note, period
  from waiting_latest
union all
select p.raw_record_id, p.batch_id, 'published', p.row_hash, p.property_id, p.effective_from, p.effective_to, p.management_fee_rate, p.fee_basis, p.note, p.period
  from published p
 where not exists (select 1 from waiting_latest w where w.property_id = p.property_id and w.effective_from = p.effective_from)
order by 1;
$function$;

CREATE OR REPLACE FUNCTION app.eff_expense (
  p_batch_id uuid
)
  RETURNS TABLE (
    raw_record_id  bigint,
    batch_id       uuid,
    origin         text,
    row_hash       text,
    expense_id     text,
    property_id    text,
    expense_date   date,
    category       text,
    amount         numeric,
    currency       text,
    payment_status text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
with latest_verdict as (
  select distinct on (v.raw_record_id) v.raw_record_id, v.status
    from app.dq_record_verdict v
    join app.dq_run r on r.run_id = v.run_id
   where r.status <> 'failed'
   order by v.raw_record_id, r.started_at desc
),
batch_rows as (
  select s.raw_record_id, s.batch_id, rr.row_hash, s.expense_id, s.property_id, s.expense_date, s.category, s.amount, s.currency, s.payment_status
    from app.stg_expense s
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
   where s.batch_id = p_batch_id
),
published as (
  select t.raw_record_id, rr.batch_id, t.row_hash, b.started_at, t.expense_id, t.property_id, t.expense_date, t.category, t.amount, t.currency, t.payment_status
    from app.expense t
    join app.raw_record rr on rr.raw_record_id = t.raw_record_id
    join app.import_batch b on b.batch_id = rr.batch_id
   where not exists (select 1 from batch_rows x where x.expense_id = t.expense_id)
),
waiting as (
  select s.raw_record_id, s.batch_id, rr.row_hash, b.started_at, s.expense_id, s.property_id, s.expense_date, s.category, s.amount, s.currency, s.payment_status
    from app.stg_expense s
    join latest_verdict lv on lv.raw_record_id = s.raw_record_id
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
    join app.import_batch b on b.batch_id = s.batch_id
   where lv.status in ('pending', 'excluded', 'duplicate')
     and s.batch_id is distinct from p_batch_id
     and not exists (select 1 from batch_rows x where x.expense_id = s.expense_id)
     and not exists (select 1 from published p where p.expense_id = s.expense_id and p.started_at >= b.started_at)
),
waiting_latest as (
  select w.*
    from waiting w
   where w.expense_id is null
      or w.started_at = (select max(w2.started_at) from waiting w2 where w2.expense_id = w.expense_id)
)
select raw_record_id, batch_id, 'batch', row_hash, expense_id, property_id, expense_date, category, amount, currency, payment_status
  from batch_rows
union all
select raw_record_id, batch_id, 'pending', row_hash, expense_id, property_id, expense_date, category, amount, currency, payment_status
  from waiting_latest
union all
select p.raw_record_id, p.batch_id, 'published', p.row_hash, p.expense_id, p.property_id, p.expense_date, p.category, p.amount, p.currency, p.payment_status
  from published p
 where not exists (select 1 from waiting_latest w where w.expense_id = p.expense_id)
order by 1;
$function$;

CREATE OR REPLACE FUNCTION app.eff_payment (
  p_batch_id uuid
)
  RETURNS TABLE (
    raw_record_id  bigint,
    batch_id       uuid,
    origin         text,
    row_hash       text,
    payment_id     text,
    reservation_id text,
    property_id    text,
    payment_date   date,
    amount         numeric,
    currency       text,
    status         text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
with latest_verdict as (
  select distinct on (v.raw_record_id) v.raw_record_id, v.status
    from app.dq_record_verdict v
    join app.dq_run r on r.run_id = v.run_id
   where r.status <> 'failed'
   order by v.raw_record_id, r.started_at desc
),
batch_rows as (
  select s.raw_record_id, s.batch_id, rr.row_hash, s.payment_id, s.reservation_id, s.property_id, s.payment_date, s.amount, s.currency, s.status
    from app.stg_payment s
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
   where s.batch_id = p_batch_id
),
published as (
  select t.raw_record_id, rr.batch_id, t.row_hash, b.started_at, t.payment_id, t.reservation_id, t.property_id, t.payment_date, t.amount, t.currency, t.status
    from app.payment t
    join app.raw_record rr on rr.raw_record_id = t.raw_record_id
    join app.import_batch b on b.batch_id = rr.batch_id
   where not exists (select 1 from batch_rows x where x.payment_id = t.payment_id)
),
waiting as (
  select s.raw_record_id, s.batch_id, rr.row_hash, b.started_at, s.payment_id, s.reservation_id, s.property_id, s.payment_date, s.amount, s.currency, s.status
    from app.stg_payment s
    join latest_verdict lv on lv.raw_record_id = s.raw_record_id
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
    join app.import_batch b on b.batch_id = s.batch_id
   where lv.status in ('pending', 'excluded', 'duplicate')
     and s.batch_id is distinct from p_batch_id
     and not exists (select 1 from batch_rows x where x.payment_id = s.payment_id)
     and not exists (select 1 from published p where p.payment_id = s.payment_id and p.started_at >= b.started_at)
),
waiting_latest as (
  select w.*
    from waiting w
   where w.payment_id is null
      or w.started_at = (select max(w2.started_at) from waiting w2 where w2.payment_id = w.payment_id)
)
select raw_record_id, batch_id, 'batch', row_hash, payment_id, reservation_id, property_id, payment_date, amount, currency, status
  from batch_rows
union all
select raw_record_id, batch_id, 'pending', row_hash, payment_id, reservation_id, property_id, payment_date, amount, currency, status
  from waiting_latest
union all
select p.raw_record_id, p.batch_id, 'published', p.row_hash, p.payment_id, p.reservation_id, p.property_id, p.payment_date, p.amount, p.currency, p.status
  from published p
 where not exists (select 1 from waiting_latest w where w.payment_id = p.payment_id)
order by 1;
$function$;

CREATE OR REPLACE FUNCTION app.eff_property (
  p_batch_id uuid
)
  RETURNS TABLE (
    raw_record_id bigint,
    batch_id      uuid,
    origin        text,
    row_hash      text,
    property_id   text,
    property_name text,
    cluster       text,
    owner_id      text,
    base_currency text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
with latest_verdict as (
  select distinct on (v.raw_record_id) v.raw_record_id, v.status
    from app.dq_record_verdict v
    join app.dq_run r on r.run_id = v.run_id
   where r.status <> 'failed'
   order by v.raw_record_id, r.started_at desc
),
batch_rows as (
  select s.raw_record_id, s.batch_id, rr.row_hash, s.property_id, s.property_name, s.cluster, s.owner_id, s.base_currency
    from app.stg_property s
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
   where s.batch_id = p_batch_id
),
published as (
  select t.raw_record_id, rr.batch_id, t.row_hash, b.started_at, t.property_id, t.property_name, t.cluster, t.owner_id, t.base_currency
    from app.property t
    join app.raw_record rr on rr.raw_record_id = t.raw_record_id
    join app.import_batch b on b.batch_id = rr.batch_id
   where not exists (select 1 from batch_rows x where x.property_id = t.property_id)
),
waiting as (
  select s.raw_record_id, s.batch_id, rr.row_hash, b.started_at, s.property_id, s.property_name, s.cluster, s.owner_id, s.base_currency
    from app.stg_property s
    join latest_verdict lv on lv.raw_record_id = s.raw_record_id
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
    join app.import_batch b on b.batch_id = s.batch_id
   where lv.status in ('pending', 'excluded', 'duplicate')
     and s.batch_id is distinct from p_batch_id
     and not exists (select 1 from batch_rows x where x.property_id = s.property_id)
     and not exists (select 1 from published p where p.property_id = s.property_id and p.started_at >= b.started_at)
),
waiting_latest as (
  select w.*
    from waiting w
   where w.property_id is null
      or w.started_at = (select max(w2.started_at) from waiting w2 where w2.property_id = w.property_id)
)
select raw_record_id, batch_id, 'batch', row_hash, property_id, property_name, cluster, owner_id, base_currency
  from batch_rows
union all
select raw_record_id, batch_id, 'pending', row_hash, property_id, property_name, cluster, owner_id, base_currency
  from waiting_latest
union all
select p.raw_record_id, p.batch_id, 'published', p.row_hash, p.property_id, p.property_name, p.cluster, p.owner_id, p.base_currency
  from published p
 where not exists (select 1 from waiting_latest w where w.property_id = p.property_id)
order by 1;
$function$;

CREATE OR REPLACE FUNCTION app.eff_reservation (
  p_batch_id uuid
)
  RETURNS TABLE (
    raw_record_id       bigint,
    batch_id            uuid,
    origin              text,
    row_hash            text,
    reservation_id      text,
    property_id         text,
    check_in            date,
    check_out           date,
    status              text,
    gross_booking_value numeric,
    currency            text,
    ota_fee             numeric,
    refund_amount       numeric,
    channel             text,
    updated_at          date,
    stay                daterange,
    nights              integer
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
with latest_verdict as (
  select distinct on (v.raw_record_id) v.raw_record_id, v.status
    from app.dq_record_verdict v
    join app.dq_run r on r.run_id = v.run_id
   where r.status <> 'failed'
   order by v.raw_record_id, r.started_at desc
),
batch_rows as (
  select s.raw_record_id, s.batch_id, rr.row_hash, s.reservation_id, s.property_id, s.check_in, s.check_out, s.status, s.gross_booking_value, s.currency, s.ota_fee, s.refund_amount, s.channel, s.updated_at, s.stay, s.nights
    from app.stg_reservation s
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
   where s.batch_id = p_batch_id
),
published as (
  select t.raw_record_id, rr.batch_id, t.row_hash, b.started_at, t.reservation_id, t.property_id, t.check_in, t.check_out, t.status, t.gross_booking_value, t.currency, t.ota_fee, t.refund_amount, t.channel, t.updated_at, t.stay, t.nights
    from app.reservation t
    join app.raw_record rr on rr.raw_record_id = t.raw_record_id
    join app.import_batch b on b.batch_id = rr.batch_id
   where not exists (select 1 from batch_rows x where x.reservation_id = t.reservation_id)
),
waiting as (
  select s.raw_record_id, s.batch_id, rr.row_hash, b.started_at, s.reservation_id, s.property_id, s.check_in, s.check_out, s.status, s.gross_booking_value, s.currency, s.ota_fee, s.refund_amount, s.channel, s.updated_at, s.stay, s.nights
    from app.stg_reservation s
    join latest_verdict lv on lv.raw_record_id = s.raw_record_id
    join app.raw_record rr on rr.raw_record_id = s.raw_record_id
    join app.import_batch b on b.batch_id = s.batch_id
   where lv.status in ('pending', 'excluded', 'duplicate')
     and s.batch_id is distinct from p_batch_id
     and not exists (select 1 from batch_rows x where x.reservation_id = s.reservation_id)
     and not exists (select 1 from published p where p.reservation_id = s.reservation_id and p.started_at >= b.started_at)
),
waiting_latest as (
  select w.*
    from waiting w
   where w.reservation_id is null
      or w.started_at = (select max(w2.started_at) from waiting w2 where w2.reservation_id = w.reservation_id)
)
select raw_record_id, batch_id, 'batch', row_hash, reservation_id, property_id, check_in, check_out, status, gross_booking_value, currency, ota_fee, refund_amount, channel, updated_at, stay, nights
  from batch_rows
union all
select raw_record_id, batch_id, 'pending', row_hash, reservation_id, property_id, check_in, check_out, status, gross_booking_value, currency, ota_fee, refund_amount, channel, updated_at, stay, nights
  from waiting_latest
union all
select p.raw_record_id, p.batch_id, 'published', p.row_hash, p.reservation_id, p.property_id, p.check_in, p.check_out, p.status, p.gross_booking_value, p.currency, p.ota_fee, p.refund_amount, p.channel, p.updated_at, p.stay, p.nights
  from published p
 where not exists (select 1 from waiting_latest w where w.reservation_id = p.reservation_id)
order by 1;
$function$;

CREATE OR REPLACE FUNCTION app.forbid_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  raise exception 'Table %.% is append-only: % is not allowed', tg_table_schema, tg_table_name, tg_op
    using hint = 'Write a new row instead of changing history';
end;
$function$;

ALTER TABLE "app"."dq_record_verdict"
  ADD CONSTRAINT "dq_record_verdict_occupancy_for_reservation" CHECK ((((entity)::text = 'reservation'::text) = (admitted_to_occupancy IS NOT NULL)));

ALTER TABLE "app"."dq_check_result"
  ADD CONSTRAINT "dq_check_result_run_id_fkey" FOREIGN KEY (run_id) REFERENCES app.dq_run(run_id);

ALTER TABLE "app"."dq_issue"
  ADD CONSTRAINT "dq_issue_closed_run_id_fkey" FOREIGN KEY (closed_run_id) REFERENCES app.dq_run(run_id);

ALTER TABLE "app"."dq_issue"
  ADD CONSTRAINT "dq_issue_first_run_id_fkey" FOREIGN KEY (first_run_id) REFERENCES app.dq_run(run_id);

ALTER TABLE "app"."dq_issue"
  ADD CONSTRAINT "dq_issue_last_run_id_fkey" FOREIGN KEY (last_run_id) REFERENCES app.dq_run(run_id);

ALTER TABLE "app"."dq_record_verdict"
  ADD CONSTRAINT "dq_record_verdict_run_id_fkey" FOREIGN KEY (run_id) REFERENCES app.dq_run(run_id);

ALTER TABLE "app"."dq_run"
  ADD CONSTRAINT "dq_run_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES app.import_batch(batch_id);

ALTER TABLE "app"."import_batch"
  ADD CONSTRAINT "import_batch_same_as_batch_id_fkey" FOREIGN KEY (same_as_batch_id) REFERENCES app.import_batch(batch_id);

ALTER TABLE "app"."import_file"
  ADD CONSTRAINT "import_file_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES app.import_batch(batch_id);

ALTER TABLE "app"."import_file"
  ADD CONSTRAINT "import_file_one_per_entity" UNIQUE (batch_id, entity);

ALTER TABLE "app"."dq_check_result"
  ADD CONSTRAINT "dq_check_result_file_id_fkey" FOREIGN KEY (file_id) REFERENCES app.import_file(file_id);

ALTER TABLE "app"."import_file"
  ADD CONSTRAINT "import_file_same_as_file_id_fkey" FOREIGN KEY (same_as_file_id) REFERENCES app.import_file(file_id);

ALTER TABLE "app"."occupancy"
  ADD CONSTRAINT "occupancy_admitted_run_id_fkey" FOREIGN KEY (admitted_run_id) REFERENCES app.dq_run(run_id);

ALTER TABLE "app"."occupancy"
  ADD CONSTRAINT "occupancy_no_overlap" EXCLUDE USING gist (property_id WITH =, stay WITH &&);

ALTER TABLE "app"."expense"
  ADD CONSTRAINT "expense_property_currency_fkey" FOREIGN KEY (property_id, currency) REFERENCES app.property(property_id, base_currency);

ALTER TABLE "app"."payment"
  ADD CONSTRAINT "payment_property_currency_fkey" FOREIGN KEY (property_id, currency) REFERENCES app.property(property_id, base_currency);

ALTER TABLE "app"."property"
  ADD CONSTRAINT "property_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES app.owner(owner_id);

ALTER TABLE "app"."commission_rule"
  ADD CONSTRAINT "commission_rule_property_id_fkey" FOREIGN KEY (property_id) REFERENCES app.property(property_id);

ALTER TABLE "app"."raw_record"
  ADD CONSTRAINT "raw_record_file_fkey" FOREIGN KEY (file_id, batch_id) REFERENCES app.import_file(file_id, batch_id);

ALTER TABLE "app"."commission_rule"
  ADD CONSTRAINT "commission_rule_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."dq_check_result"
  ADD CONSTRAINT "dq_check_result_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."dq_record_verdict"
  ADD CONSTRAINT "dq_record_verdict_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."expense"
  ADD CONSTRAINT "expense_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."payment"
  ADD CONSTRAINT "payment_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."property"
  ADD CONSTRAINT "property_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."record_version"
  ADD CONSTRAINT "record_version_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."record_version"
  ADD CONSTRAINT "record_version_run_id_fkey" FOREIGN KEY (run_id) REFERENCES app.dq_run(run_id);

ALTER TABLE "app"."record_version"
  ADD CONSTRAINT "record_version_unique" UNIQUE (entity, record_key, VERSION);

ALTER TABLE "app"."reservation"
  ADD CONSTRAINT "reservation_occupancy_key" UNIQUE (reservation_id, property_id, stay);

ALTER TABLE "app"."occupancy"
  ADD CONSTRAINT "occupancy_reservation_fkey" FOREIGN KEY (reservation_id, property_id, stay) REFERENCES app.reservation(reservation_id, property_id, stay) ON UPDATE CASCADE
    ON DELETE CASCADE;

ALTER TABLE "app"."payment"
  ADD CONSTRAINT "payment_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES app.reservation(reservation_id);

ALTER TABLE "app"."reservation"
  ADD CONSTRAINT "reservation_origin_reservation_id_fkey" FOREIGN KEY (origin_reservation_id) REFERENCES app.reservation(reservation_id);

ALTER TABLE "app"."reservation"
  ADD CONSTRAINT "reservation_property_currency_fkey" FOREIGN KEY (property_id, currency) REFERENCES app.property(property_id, base_currency);

ALTER TABLE "app"."reservation"
  ADD CONSTRAINT "reservation_raw_record_id_fkey" FOREIGN KEY (raw_record_id) REFERENCES app.raw_record(raw_record_id);

ALTER TABLE "app"."review_decision"
  ADD CONSTRAINT "review_decision_issue_id_fkey" FOREIGN KEY (issue_id) REFERENCES app.dq_issue(issue_id);

ALTER TABLE "app"."dq_record_verdict"
  ADD CONSTRAINT "dq_record_verdict_decision_id_fkey" FOREIGN KEY (decision_id) REFERENCES app.review_decision(decision_id);

ALTER TABLE "app"."occupancy"
  ADD CONSTRAINT "occupancy_decision_id_fkey" FOREIGN KEY (decision_id) REFERENCES app.review_decision(decision_id);

ALTER TABLE "app"."stg_commission_rule"
  ADD CONSTRAINT "stg_commission_rule_raw_record_fkey" FOREIGN KEY (raw_record_id, batch_id) REFERENCES app.raw_record(raw_record_id, batch_id);

ALTER TABLE "app"."stg_expense"
  ADD CONSTRAINT "stg_expense_raw_record_fkey" FOREIGN KEY (raw_record_id, batch_id) REFERENCES app.raw_record(raw_record_id, batch_id);

ALTER TABLE "app"."stg_payment"
  ADD CONSTRAINT "stg_payment_raw_record_fkey" FOREIGN KEY (raw_record_id, batch_id) REFERENCES app.raw_record(raw_record_id, batch_id);

ALTER TABLE "app"."stg_property"
  ADD CONSTRAINT "stg_property_raw_record_fkey" FOREIGN KEY (raw_record_id, batch_id) REFERENCES app.raw_record(raw_record_id, batch_id);

ALTER TABLE "app"."stg_reservation"
  ADD CONSTRAINT "stg_reservation_raw_record_fkey" FOREIGN KEY (raw_record_id, batch_id) REFERENCES app.raw_record(raw_record_id, batch_id);

CREATE VIEW "app"."review_case" WITH (security_invoker=true) AS  SELECT (details ->> 'case_key'::text) AS case_key,
    entity,
    array_agg(DISTINCT record_key ORDER BY record_key) AS record_keys,
    array_agg(DISTINCT rule_id ORDER BY rule_id) AS rule_ids,
    (count(*))::integer AS issue_count,
    (count(*) FILTER (WHERE (status = 'open'::text)))::integer AS open_count,
        CASE
            WHEN bool_or((status = 'open'::text)) THEN 'open'::text
            ELSE 'resolved'::text
        END AS status,
    min(opened_at) AS opened_at,
    max(updated_at) AS updated_at
   FROM app.dq_issue i
  WHERE ((action = 'decide'::text) AND (status <> 'closed'::text))
  GROUP BY (details ->> 'case_key'::text), entity;

CREATE INDEX dq_check_result_raw_record ON app.dq_check_result USING btree (raw_record_id);

CREATE UNIQUE INDEX dq_issue_active_unique ON app.dq_issue USING btree (rule_id, entity, record_key)
  WHERE (status <> 'closed'::text);

CREATE INDEX dq_issue_case ON app.dq_issue USING btree (((details ->> 'case_key'::text)))
  WHERE ((action = 'decide'::text) AND (status <> 'closed'::text));

CREATE INDEX dq_issue_open ON app.dq_issue USING btree (status, rule_id)
  WHERE (status = 'open'::text);

CREATE INDEX dq_run_batch ON app.dq_run USING btree (batch_id, started_at DESC);

CREATE INDEX expense_property_date ON app.expense USING btree (property_id, expense_date);

CREATE INDEX import_file_sha256 ON app.import_file USING btree (entity, file_sha256);

CREATE INDEX payment_property_date ON app.payment USING btree (property_id, payment_date);

CREATE INDEX payment_reservation ON app.payment USING btree (reservation_id);

CREATE INDEX property_owner ON app.property USING btree (owner_id);

CREATE INDEX raw_record_batch_record_key ON app.raw_record USING btree (batch_id, record_key);

CREATE INDEX reservation_property_check_in ON app.reservation USING btree (property_id, check_in);

CREATE INDEX review_decision_case ON app.review_decision USING btree (case_key, record_key, decided_at DESC)
  WHERE (case_key IS NOT NULL);

CREATE INDEX review_decision_issue ON app.review_decision USING btree (issue_id, decided_at DESC)
  WHERE (issue_id IS NOT NULL);

CREATE INDEX stg_commission_rule_period ON app.stg_commission_rule USING gist (batch_id, property_id, period);

CREATE INDEX stg_expense_batch ON app.stg_expense USING btree (batch_id, expense_id);

CREATE INDEX stg_payment_batch_reservation ON app.stg_payment USING btree (batch_id, reservation_id);

CREATE INDEX stg_payment_batch ON app.stg_payment USING btree (batch_id, payment_id);

CREATE INDEX stg_property_batch ON app.stg_property USING btree (batch_id, property_id);

CREATE INDEX stg_reservation_batch ON app.stg_reservation USING btree (batch_id, reservation_id);

CREATE INDEX stg_reservation_stay ON app.stg_reservation USING gist (batch_id, property_id, stay);

CREATE TRIGGER commission_rule_history
  AFTER INSERT OR DELETE OR UPDATE ON app.commission_rule
  FOR EACH ROW
  EXECUTE FUNCTION app.capture_record_version('property_id', 'effective_from');

CREATE TRIGGER dq_check_result_append_only
  BEFORE DELETE OR UPDATE OR TRUNCATE ON app.dq_check_result
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.forbid_change();

CREATE TRIGGER dq_record_verdict_append_only
  BEFORE DELETE OR UPDATE OR TRUNCATE ON app.dq_record_verdict
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.forbid_change();

CREATE TRIGGER expense_history
  AFTER INSERT OR DELETE OR UPDATE ON app.expense
  FOR EACH ROW
  EXECUTE FUNCTION app.capture_record_version('expense_id');

CREATE TRIGGER occupancy_check_availability
  BEFORE INSERT OR UPDATE OF property_id, stay ON app.occupancy
  FOR EACH ROW
  EXECUTE FUNCTION app.check_property_availability();

CREATE TRIGGER payment_history
  AFTER INSERT OR DELETE OR UPDATE ON app.payment
  FOR EACH ROW
  EXECUTE FUNCTION app.capture_record_version('payment_id');

CREATE TRIGGER property_history
  AFTER INSERT OR DELETE OR UPDATE ON app.property
  FOR EACH ROW
  EXECUTE FUNCTION app.capture_record_version('property_id');

CREATE TRIGGER raw_record_append_only
  BEFORE DELETE OR UPDATE OR TRUNCATE ON app.raw_record
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.forbid_change();

CREATE TRIGGER record_version_append_only
  BEFORE DELETE OR UPDATE OR TRUNCATE ON app.record_version
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.forbid_change();

CREATE TRIGGER reservation_history
  AFTER INSERT OR DELETE OR UPDATE ON app.reservation
  FOR EACH ROW
  EXECUTE FUNCTION app.capture_record_version('reservation_id');

CREATE TRIGGER review_decision_append_only
  BEFORE DELETE OR UPDATE OR TRUNCATE ON app.review_decision
  FOR EACH STATEMENT
  EXECUTE FUNCTION app.forbid_change();

COMMENT ON EXTENSION "btree_gist" IS 'support for indexing common datatypes in GiST';

COMMENT ON FUNCTION "app"."capture_record_version"() IS 'Пишет версию записи основной таблицы в app.record_version: данные целиком, строка источника, запуск, автор.';

COMMENT ON FUNCTION "app"."check_property_availability"() IS 'Не даёт допустить в календарь бронь, которая пересекается с уже допущенной на той же вилле. Интервалы [check_in, check_out): выезд и заезд в один день не пересечение. Ошибка 23P01 с номером конфликтующей брони.';

COMMENT ON FUNCTION "app"."eff_commission_rule"(uuid) IS 'Действующий набор правил комиссии для проверок: строки пачки, затем pending/excluded/duplicate прежних пачек, затем опубликованные; приоритет по ключу (property_id, effective_from). origin: batch | pending | published.';

COMMENT ON FUNCTION "app"."eff_expense"(uuid) IS 'Действующий набор расходов для проверок: строки пачки, затем pending/excluded/duplicate прежних пачек, затем опубликованные; приоритет по ключу (expense_id). origin: batch | pending | published.';

COMMENT ON FUNCTION "app"."eff_payment"(uuid) IS 'Действующий набор платежей для проверок: строки пачки, затем pending/excluded/duplicate прежних пачек, затем опубликованные; приоритет по ключу (payment_id). origin: batch | pending | published.';

COMMENT ON FUNCTION "app"."eff_property"(uuid) IS 'Действующий набор объектов для проверок: строки пачки, затем pending/excluded/duplicate прежних пачек, затем опубликованные; приоритет по ключу (property_id). origin: batch | pending | published.';

COMMENT ON FUNCTION "app"."eff_reservation"(uuid) IS 'Действующий набор броней для проверок: строки пачки, затем pending/excluded/duplicate прежних пачек, затем опубликованные; приоритет по ключу (reservation_id). origin: batch | pending | published.';

COMMENT ON FUNCTION "app"."forbid_change"() IS 'Запрещает UPDATE, DELETE и TRUNCATE в таблицах «только дописывание»: история не переписывается.';

COMMENT ON TRIGGER "occupancy_check_availability" ON "app"."occupancy" IS 'Перед допуском брони в календарь или сменой виллы/дат проверяет, что вилла свободна. Понятная ошибка с номером конфликтующей брони; гарантию даёт occupancy_no_overlap.';

COMMENT ON VIEW "app"."review_case" IS 'Случаи разбора: проблемы decide с общим case_key, статус open/resolved и прогресс по ним.';
