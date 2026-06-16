-- =============================================
-- PrintAI Planner — Supabase Schema
-- Run this in your Supabase SQL Editor
-- =============================================

-- Orders table
create table if not exists orders (
  id           text primary key,
  customer     text not null,
  product      text not null,
  quantity     integer not null,
  paper_type   text not null,
  priority     text not null,
  deadline     timestamptz not null,
  status       text not null default 'Pending',
  created_at   timestamptz not null default now()
);

-- Machines table (pre-populated)
create table if not exists machines (
  id           text primary key,
  speed        integer not null,
  capacity     integer not null,
  status       text not null default 'available',
  paper_types  text[] not null default '{}',
  utilisation  integer not null default 0
);

-- Schedules table
create table if not exists schedules (
  id           uuid primary key default gen_random_uuid(),
  order_id     text references orders(id) on delete cascade,
  tasks        jsonb not null,
  overall_finish timestamptz not null,
  sla_status   text not null,
  sla_diff     integer not null,
  explanation  text,
  created_at   timestamptz not null default now()
);

-- Seed machines
insert into machines (id, speed, capacity, status, paper_types, utilisation) values
  ('M1', 500, 10000, 'available', array['Coated'], 0),
  ('M2', 400,  8000, 'busy',      array['Glossy'], 0),
  ('M3', 600, 12000, 'available', array['Matte'], 0),
  ('M4', 450,  9000, 'available', array['Uncoated'], 0),
  ('M5', 300,  6000, 'backup',    array['Coated','Glossy','Matte','Uncoated'], 0)
on conflict (id) do update set
  speed = excluded.speed,
  capacity = excluded.capacity,
  paper_types = excluded.paper_types;

-- Row Level Security (optional — enable if you add auth)
-- alter table orders enable row level security;
-- alter table schedules enable row level security;
-- alter table machines enable row level security;
