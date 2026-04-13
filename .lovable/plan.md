

# Fix ranking results display and progress bar

## Problem 1: Positions always null
The domain matching logic (`item.domain.includes(clientDomain)`) may miss matches where DataForSEO returns a subdomain like `www.studio250.net` or a different format. Also, the UI shows nothing useful when position is null — no indication that the keyword was checked but not found in top 100.

**Fix in `supabase/functions/fetch-ranking-results/index.ts`:**
- Normalize domain comparison: strip "www." from both `item.domain` and `clientDomain`, and also try matching the other way (`clientDomain.includes(item.domain)`)
- Add console logging of the first few organic domains found per task so we can debug what DataForSEO actually returns

**Fix in `src/components/dashboard/KeywordsTab.tsx`:**
- When position is null but rank_history records exist, show "100+" or "Not in top 100" instead of a blank dash — this tells the user the sync ran but the site isn't ranking

## Problem 2: Progress bar jumps from 0% to done
The first poll at 15s finds everything already complete, so you never see incremental progress.

**Fix in `src/components/dashboard/KeywordsTab.tsx`:**
- Reduce initial poll delay to 5 seconds (DataForSEO tasks typically take 10-30 seconds)
- Reduce poll interval to 10 seconds  
- Make the progress bar show a pulsing/indeterminate state while waiting for first poll results (show "Waiting for results..." with an animated progress bar)
- Accumulate `syncCompleted` properly across polls (add to previous value, don't replace)

## Problem 3: Duplicate rank_history entries
Each sync creates 14 new rank_history rows. You've synced ~5 times, creating 70 rows — all null. The sync doesn't check if a sync was already done recently.

**Fix in `supabase/functions/sync-rankings/index.ts`:**
- Before posting tasks, check if there are already pending ranking_tasks for this client. If so, skip re-posting and return a message.

## Files changed
1. `supabase/functions/fetch-ranking-results/index.ts` — better domain matching + debug logging
2. `src/components/dashboard/KeywordsTab.tsx` — show "100+" for null positions, fix progress bar timing, indeterminate state
3. `supabase/functions/sync-rankings/index.ts` — prevent duplicate syncs

