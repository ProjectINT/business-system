-- Сущности источника, по одному файлу на каждую. Общий словарь для импорта, журнала проверок
-- и истории версий: новая сущность добавляется в одном месте, а не в пяти check-ограничениях.
create domain app.source_entity as text
check (value in ('property', 'commission_rule', 'reservation', 'payment', 'expense'));
