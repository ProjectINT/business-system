-- ЧЕРНОВИК: минимум полей, нужный для проверки пересечений. Полную схему делаем отдельно.
create table app.property (
  property_id   text primary key,
  property_name text not null
);

alter table app.property enable row level security;
