-- Execute isso no SQL Editor do Supabase

create extension if not exists "pgcrypto";

-- Fila de espera
create table if not exists queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now()
);

-- Salas de chat
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  user1 uuid not null,
  user2 uuid not null,
  active boolean default true,
  created_at timestamp with time zone default now()
);

-- Mensagens
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  sender uuid not null,
  content text not null,
  created_at timestamp with time zone default now()
);

-- Habilitar Realtime nas tabelas
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table queue;

-- Permissões públicas (anon)
alter table queue enable row level security;
alter table rooms enable row level security;
alter table messages enable row level security;

create policy "allow all queue" on queue for all using (true) with check (true);
create policy "allow all rooms" on rooms for all using (true) with check (true);
create policy "allow all messages" on messages for all using (true) with check (true);
