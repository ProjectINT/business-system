-- ЧЕРНОВИК: статусы из reservations.csv.
create type app.reservation_status as enum ('confirmed', 'modified', 'cancelled');
