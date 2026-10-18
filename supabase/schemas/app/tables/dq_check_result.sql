-- Вердикт правила по единице проверки: строке источника или файлу целиком (DQ-90).
-- Правило выносит вердикт по каждой единице своей области, раннер проверяет покрытие (VALIDATION_PLAN.md, 3).
-- Только дописывание: журнал запуска не переписывается, повторный запуск пишет новый.
create table app.dq_check_result (
  result_id bigint generated always as identity primary key,
  run_id uuid not null references app.dq_run,
  rule_id text not null,
  rule_version integer not null,
  entity app.source_entity not null,
  raw_record_id bigint references app.raw_record,
  file_id bigint references app.import_file,
  record_key text,  -- R0015, P0075 ...; null для файла
  outcome text not null,
  action text not null,  -- что значит fail для статуса строки
  reason text,  -- обязательна для skip: «не проверяли» ≠ «проверили, всё в порядке»
  details jsonb,  -- факты: суммы, ставка, интервал пересечения
  related_keys text[],  -- вторая бронь пары, кандидат на исходную бронь, платёж
  amount_idr numeric(18, 2),  -- сумма под вопросом, для сводки
  constraint dq_check_result_one_unit check (num_nonnulls(raw_record_id, file_id) = 1),
  -- по одному вердикту правила на единицу; null в другой колонке не мешает (nulls distinct)
  constraint dq_check_result_row_unique unique (run_id, rule_id, raw_record_id),
  constraint dq_check_result_file_unique unique (run_id, rule_id, file_id),
  constraint dq_check_result_rule_id_format check (rule_id ~ '^DQ-\d{2}$'),
  constraint dq_check_result_outcome_known check (outcome in ('pass', 'fail', 'skip', 'error')),
  constraint dq_check_result_action_known check (action in ('duplicate', 'exclude', 'review', 'info')),
  constraint dq_check_result_skip_has_reason check (outcome <> 'skip' or reason is not null)
);

-- все проверки одной строки: карточка записи в интерфейсе
create index dq_check_result_raw_record on app.dq_check_result (raw_record_id);

alter table app.dq_check_result enable row level security;

create trigger dq_check_result_append_only
before update or delete or truncate on app.dq_check_result
for each statement execute function app.forbid_change();
