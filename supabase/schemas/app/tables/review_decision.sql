-- Решение человека по проблеме из очереди проверки (PLAN.md, раздел 9).
-- Только дописывание: новое решение по той же проблеме заменяет предыдущее, старое остаётся в истории.
-- Решение действует, пока не изменилась строка: его row_hash должен совпадать с dq_issue.row_hash.
--   accept      — запись верна как есть; по DQ-12 — бронь допускается в календарь (occupancy);
--   exclude     — запись исключается из расчётов;
--   correct     — исправленные значения в payload {"поле": "значение"}; исходная строка не меняется,
--                 исправление применяется при публикации;
--   link_origin — связь modified с исходной бронью: payload {"origin_reservation_id": "R0027"} (DQ-13, DQ-21).
create table app.review_decision (
  decision_id bigint generated always as identity primary key,
  issue_id bigint not null references app.dq_issue,
  decision text not null,
  row_hash text not null,
  payload jsonb,
  comment text not null,  -- обоснование обязательно: это аудит
  decided_by text not null,  -- пользователь; до появления входа — имя из интерфейса или CLI
  decided_at timestamptz not null default now(),
  constraint review_decision_known check (decision in ('accept', 'exclude', 'correct', 'link_origin')),
  constraint review_decision_payload_needed
  check ((decision in ('correct', 'link_origin')) = (payload is not null)),
  constraint review_decision_comment_present check (btrim(comment) <> '')
);

-- действующее решение по проблеме — последнее
create index review_decision_issue on app.review_decision (issue_id, decided_at desc);

alter table app.review_decision enable row level security;

create trigger review_decision_append_only
before update or delete or truncate on app.review_decision
for each statement execute function app.forbid_change();
