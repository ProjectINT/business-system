-- Без даты среза: проверки считают «сегодня» по Бали в момент запуска (dq_run.started_at).
ALTER TABLE "app"."dq_run"
  DROP COLUMN "as_of",
  DROP COLUMN "as_of_defaulted";

ALTER TABLE "app"."import_batch"
  DROP COLUMN "as_of";
