

# Enhance generate-suggestions with Richer Data Sources

## Summary
Enrich the AI prompt in the `generate-suggestions` edge function with GSC data, search volumes, and keyword statuses. Increase suggestions from 3 to 5.

## Changes (single file: `supabase/functions/generate-suggestions/index.ts`)

### 1. New data fetches (add after existing keyword/competitor fetches)

- **GSC query data**: Query `gsc_query_data` for this client, ordered by impressions desc, limit 50. Format each row as `query | position | impressions | clicks | CTR%`.
- **Search volumes**: Query `keyword_search_volume` for all keyword IDs. Build a map of `keyword_id → search_volume`. Append volume to each keyword in the KEYWORD RANKINGS section (e.g. `"plumber austin" — position #5 today (up 3 spots) · 2,400 searches/mo`).
- **Keyword statuses**: Group keywords by their `status` field (monitoring, optimizing, low_priority) into a new prompt section.

### 2. New prompt sections

- **GOOGLE SEARCH CONSOLE DATA (top 50 by impressions)**: Table of query, avg position, impressions, clicks, CTR for each GSC row.
- **KEYWORD STATUSES**: Keywords grouped by status so the AI prioritizes "optimizing" keywords.

### 3. Updated prompt instructions

Add to RULES:
- Factor in GSC impressions and click-through rates
- Identify high-impression low-CTR queries as content optimization opportunities  
- Suggest new keywords to track based on GSC queries not yet in the keywords table
- Compare tracked keywords list vs GSC queries to find gaps

### 4. Increase output from 3 to 5 suggestions

- Update prompt text from "exactly 3" to "exactly 5"
- Update JSON example to show 5 entries
- Increase `max_tokens` from 1000 to 2000 to accommodate longer response

### 5. No changes needed for competitors

The `competitors` table only has `id, client_id, domain, is_tracked, is_auto_discovered, created_at` — no visibility scores or overlap data columns exist. Keep the current competitor domain list as-is.

## Technical details

- All new queries use the existing `supabase` service-role client
- GSC data may have multiple rows per query (different dates) — aggregate by query: sum impressions/clicks, average position, compute CTR
- Search volume join: query `keyword_search_volume` with `.in("keyword_id", keywordIds)`, take the first/latest volume per keyword
- No database changes needed, no new tables or columns

