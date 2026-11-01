create table if not exists room_states (
  code char(6) primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  data jsonb not null, version int not null default 0, updated_at timestamptz not null default now());
alter table room_states enable row level security;  -- no policies on purpose: only the Edge Function (service role) can read/write
create index if not exists room_states_updated on room_states(updated_at);
create or replace function cleanup_rooms() returns void language sql as $$ delete from room_states where updated_at < now() - interval '1 day'; $$;
