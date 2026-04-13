

# Fix: Missing landing pages and search volume data

## What's happening

1. **Landing pages showing "—"**: The `target_url` field on all keywords is `NULL`. No landing page was ever set — either during keyword creation or afterward. The UI correctly shows "—" for null values.

2. **Volume showing "—"**: DataForSEO's Google Ads Search Volume API returned `null` for most keywords. Out of ~20 Spagnoli keywords, only 4 have volume data (e.g., "hardwood floor refinishing NYC" = 110). The rest are niche/long-tail keywords that Google Ads doesn't have volume data for — DataForSEO simply returns null for those.

## Proposed fixes

### 1. Auto-populate landing pages from rank_history
When a ranking result comes back from DataForSEO, it includes the URL that ranked. We should store that URL as the `target_url` on the keyword if it's currently null. This way landing pages get filled in automatically after the first successful rank check.

**File**: `supabase/functions/fetch-ranking-results/index.ts` — after finding the client domain in organic results, update `keywords.target_url` if it's null.

### 2. Show "N/A" instead of "—" for volume when search volume was fetched but returned null
Distinguish between "never fetched" and "no data available":
- If a `keyword_search_volume` row exists with `search_volume = NULL` → show "N/A" (meaning DataForSEO checked but Google has no data)
- If no `keyword_search_volume` row exists at all → show "—" (meaning volume was never fetched)

**File**: `src/components/dashboard/KeywordsTab.tsx` — adjust the volume display logic and the data query to differentiate these two states.

### 3. Trigger volume fetch automatically after adding keywords
Currently the user has to manually trigger a volume fetch. We should auto-trigger `fetch-search-volume` when keywords are added.

**File**: `src/components/dashboard/KeywordsTab.tsx` — call `fetch-search-volume` after successful keyword addition.

## Files changed
1. `supabase/functions/fetch-ranking-results/index.ts` — save ranked URL as target_url
2. `src/components/dashboard/KeywordsTab.tsx` — volume display logic + auto-fetch volume on keyword add

