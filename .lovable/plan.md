

# Fix: "Nothing to sync" caused by stale pending tasks

## Root cause
The cleanup migration only deleted `completed` ranking_tasks. There are **20 stale `pending` tasks** for Spagnoli still in the database. The duplicate-sync guard (lines 35-46 of `sync-rankings`) sees these and returns `task_count: 0`, which the UI displays as "Nothing to sync."

## Fix

### 1. Database cleanup (migration)
Delete all stale `pending` ranking_tasks — these are from previous syncs where DataForSEO already processed the results but the tasks were never marked completed (due to the earlier bugs).

```sql
DELETE FROM public.ranking_tasks WHERE status = 'pending';
```

### 2. Improve the duplicate-sync guard (`supabase/functions/sync-rankings/index.ts`)
The current guard returns `task_count: 0` which triggers the "Nothing to sync" toast. Two improvements:
- Return a **distinct message** like `"already_syncing"` so the UI can show "Sync already in progress" instead of "Nothing to sync"
- Add a **staleness check**: only block if pending tasks are less than 10 minutes old. If they're older, they're stale — delete them and proceed with a fresh sync.

### 3. Update UI toast logic (`src/components/dashboard/KeywordsTab.tsx`)
Check for the `"already_syncing"` message from the response and show an appropriate toast ("Sync already in progress") instead of "Nothing to sync."

## Files changed
1. New migration — delete stale pending ranking_tasks
2. `supabase/functions/sync-rankings/index.ts` — add staleness check + distinct response
3. `src/components/dashboard/KeywordsTab.tsx` — handle "already_syncing" response

