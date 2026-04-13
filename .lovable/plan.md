

# Fix sync-rankings timeout — split into post + poll

## Problem
The `sync-rankings` edge function has a **hard-coded 60-second `setTimeout`** (line 84) where it sleeps waiting for DataForSEO to process tasks before fetching results. This causes the edge function to exceed its timeout limit, resulting in the spinner that never stops and the delayed/vague toast message.

## Solution: Split into two edge functions

Instead of one function that posts tasks, sleeps 60s, then fetches results, split the work:

### 1. New edge function: `fetch-ranking-results`
A second edge function that fetches completed results from DataForSEO by task ID.

### 2. Refactor `sync-rankings` to return immediately
- Post tasks to DataForSEO (keep as-is)
- Save task IDs + metadata to a new `ranking_tasks` table
- Return immediately with `{ status: "queued", task_count: N }`
- Remove the 60-second sleep entirely

### 3. New table: `ranking_tasks`
Stores pending DataForSEO task IDs so results can be fetched later.

```sql
create table public.ranking_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  dataforseo_task_id text not null,
  keyword_id uuid references keywords(id) on delete cascade not null,
  city_id uuid references client_cities(id) on delete cascade not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);
alter table public.ranking_tasks enable row level security;
create policy "Users can view own ranking tasks" on public.ranking_tasks for select to authenticated using (true);
```

### 4. Update `fetch-ranking-results` edge function
- Query `ranking_tasks` where `status = 'pending'` for the given client
- Fetch results from DataForSEO for each task ID
- Insert into `rank_history`, update task status to `completed`
- Handle rank drop alerts and cost logging (moved from sync-rankings)

### 5. Update frontend (`KeywordsTab.tsx`)
- `handleSync`: call `sync-rankings`, get immediate response, show "Sync queued" toast
- Start polling: call `fetch-ranking-results` every 15 seconds (up to 6 times / 90 seconds)
- When results come back, invalidate queries and stop polling
- Show progress: "Checking for results..." indicator instead of infinite spinner

### Files changed
1. **New migration** — create `ranking_tasks` table
2. **`supabase/functions/sync-rankings/index.ts`** — remove sleep + result fetching, save task IDs to DB, return immediately
3. **New `supabase/functions/fetch-ranking-results/index.ts`** — fetch results from DataForSEO, insert rank_history
4. **`src/components/dashboard/KeywordsTab.tsx`** — immediate response handling + polling logic

