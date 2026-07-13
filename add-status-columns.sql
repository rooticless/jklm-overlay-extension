alter table profiles
add column if not exists status text default 'Offline';

alter table profiles
add column if not exists last_online timestamptz;
