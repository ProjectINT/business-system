#!/usr/bin/env bash
# Архив для проверяющего: CLI финального задания одним файлом, запуск без npm i (docs/FINAL_TEST_PLAN.md, фаза 5).
#
#   npm run nightly:pack        →  dist/nightly-cli.zip
#
# Внутри: nightly.mjs (scripts/nightly.ts + lib/nightly + lib/calc + zod, собрано esbuild), файлы задания,
# results_public.json, IMPLEMENTATION_NOTES.md и README с инструкцией. В конце архив распаковывается во
# временную папку и прогоняется на case_public.json: результат должен совпасть с final-test/results_public.json
# байт в байт, иначе скрипт падает. В README архива попадает хэш HEAD — собирать после коммита.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO=https://github.com/ProjectINT/business-system
SHA=$(git rev-parse --short HEAD)
OUT=dist/nightly-cli
ZIP=dist/nightly-cli.zip

if [ -n "$(git status --porcelain)" ]; then
  echo "warning: рабочее дерево не чистое, в README архива уйдёт хэш $SHA без этих изменений" >&2
fi

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"

npx esbuild scripts/nightly.ts --bundle --platform=node --format=esm --target=node22 \
  --log-level=warning --outfile="$OUT/nightly.mjs"
cp final-test/case_public.json final-test/output_schema.json final-test/results_public.json "$OUT/"
# В архиве нет docs/ и README репозитория: ссылки заметок ведут на GitHub, на тот же коммит.
sed -e "s|](docs/|]($REPO/blob/$SHA/docs/|g" \
    -e "s|README, раздел «Финальное задание»|[README репозитория, раздел «Финальное задание»]($REPO/blob/$SHA/README.md#финальное-задание)|" \
    IMPLEMENTATION_NOTES.md > "$OUT/IMPLEMENTATION_NOTES.md"

cat > "$OUT/README.md" <<EOF
# Комиссия по ночам: CLI

Финальное задание Senior Business Systems Engineer: расчёт комиссии по ночам и защита от повторного импорта.
Это запускаемая версия CLI из репозитория $REPO (модуль \`lib/nightly\`, коммит \`$SHA\`);
исходники на TypeScript, тесты и план с решениями — там.

## Запуск

Нужен Node.js 22 или новее. Ставить зависимости не нужно.

\`\`\`bash
node nightly.mjs case_public.json results_public.json
\`\`\`

Первый аргумент — входной JSON в формате \`case_public.json\`, второй — куда записать результат по \`output_schema.json\`.
Другой набор данных того же формата (другие ставки, новые версии броней) считается теми же двумя аргументами;
одинаковый вход даёт одинаковый файл байт в байт, текущая дата не используется.

CLI печатает одну строку: \`results_public.json: FINAL_VILLA_2026_PUBLIC_A, exceptions 3, dedup 1/1/1 (events/versions/payments)\`.
Код выхода 0 — файл записан; 1 — вход не читается или не соответствует формату, в stderr путь к полю, файл не пишется; 2 — неверные аргументы.

## Что в архиве

- \`nightly.mjs\` — CLI одним файлом: \`scripts/nightly.ts\`, \`lib/nightly\`, примитивы \`lib/calc\` и zod, собранные esbuild из репозитория (\`npm run nightly:pack\`).
- \`case_public.json\`, \`output_schema.json\` — файлы задания.
- \`results_public.json\` — результат на \`case_public.json\`, тот же файл, что в репозитории; команда выше перезаписывает его тем же содержимым.
- \`IMPLEMENTATION_NOTES.md\` — заметки по реализации: что было готово, что изменено, повторный импорт, перенос в PostgreSQL при живых Google Sheets.

## Тесты

Тесты написаны на vitest и запускаются из репозитория:

\`\`\`bash
git clone $REPO.git
cd business-system
npm i
npx vitest run lib/nightly   # 147 тестов модуля
npm test                     # весь проект: 76 файлов, 771 тест
\`\`\`

Среди тестов модуля: смена ставки в середине проживания (F1), дубли платежа и версии брони (F2), инвариант «Σ ночей = сумма брони»
на случайных данных, golden по \`case_public.json\`, тест на изменённом кейсе (ставка 2200, новая версия R101) и сверка вывода CLI
с \`results_public.json\` байт в байт.
EOF

(cd dist && zip -qr nightly-cli.zip nightly-cli)

# Проверка архива: распаковать в чистую папку и посчитать case_public.json.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
unzip -q "$ZIP" -d "$TMP"
(cd "$TMP/nightly-cli" && node nightly.mjs case_public.json check.json >/dev/null)
cmp -s "$TMP/nightly-cli/check.json" final-test/results_public.json \
  || { echo "error: архив считает не то, что в final-test/results_public.json" >&2; exit 1; }

echo "$ZIP: $(du -h "$ZIP" | cut -f1), коммит $SHA, результат на case_public.json совпадает"
