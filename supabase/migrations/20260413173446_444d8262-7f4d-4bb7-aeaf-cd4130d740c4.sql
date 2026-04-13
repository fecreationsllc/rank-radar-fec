
create table public.ranking_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade not null,
  dataforseo_task_id text not null,
  keyword_id uuid references public.keywords(id) on delete cascade not null,
  city_id uuid references public.client_cities(id) on delete cascade not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);

alter table public.ranking_tasks enable row level security;

create policy "Authenticated users can view ranking tasks"
  on public.ranking_tasks for select to authenticated using (true);

create policy "Service role full access"
  on public.ranking_tasks for all to service_role using (true) with check (true);
