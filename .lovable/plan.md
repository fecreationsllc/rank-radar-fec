

# Fix: DataForSEO results fetched too early, recorded as empty

## Root cause
The `fetch-ranking-results` function polls DataForSEO ~14 seconds after task creation. DataForSEO hasn't finished processing yet, but instead of returning status code 40601 ("not ready"), it sometimes returns a valid-looking response with an empty `items` array. The current code only checks for `status_code === 40601` to skip — so it treats empty results as "done," inserts a null position into `rank_history`, and marks the task `completed`. The data is permanently lost.

## Fix

### 1. `supabase/functions/fetch-ranking-results/index.ts`
- After checking `status_code === 40601`, also check if `items` is null/empty. If the result has zero organic items AND the task was created less than 5 minutes ago, treat it as "not ready" and **skip** (don't mark completed).
- Add a log line showing `taskResult.status_code` and `items?.length` for every task so we can debug future issues.
- Only mark a task completed + insert null position if the task is older than 5 minutes (meaning DataForSEO genuinely found nothing).

### 2. `src/components/dashboard/KeywordsTab.tsx`
- Increase initial poll delay from 5s to **20 seconds** — DataForSEO typically needs 15-30 seconds.
- Keep subsequent poll interval at 10 seconds.

### 3. Clean up bad data (migration)
- Delete all `rank_history` rows where `position IS NULL` for the Spagnoli client, so the next sync gets clean results.
- Reset `ranking_tasks` status back to `pending` for the most recent Spagnoli tasks so they can be re-fetched, OR delete them so a fresh sync can be triggered.

## Files changed
1. `supabase/functions/fetch-ranking-results/index.ts` — skip empty results for recent tasks
2. `src/components/dashboard/KeywordsTab.tsx` — increase initial poll delay to 20s
3. New migration — clean up null rank_history + stale ranking_tasks for re-sync

