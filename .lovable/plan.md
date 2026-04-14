

# Import Ranked Keywords Feature

## Summary
Add an "Import Ranked Keywords" button to the Keywords tab that fetches the client's currently-ranking keywords from DataForSEO and lets the user select which ones to add to tracking.

## New Files

### 1. Edge function: `supabase/functions/get-ranked-keywords/index.ts`
- Accept POST with `{ domain, location_code }` 
- Call DataForSEO Labs `ranked_keywords/live` endpoint with basic auth (DATAFORSEO_LOGIN/PASSWORD)
- Body: `[{ target: domain, location_code, language_code: "en", limit: 100, filters: ["ranked_serp_element.serp_item.rank_absolute","<=",100] }]`
- Parse response, extract keyword, position (`rank_absolute`), and search volume (`keyword_data.keyword_info.search_volume`)
- Return sorted by search volume descending
- Include CORS headers

### 2. Modal: `src/components/dashboard/ImportRankedKeywordsModal.tsx`
- Styled like SuggestKeywordsModal but wider (max-w-lg) to fit position column
- Props: `open, onOpenChange, clientId, clientDomain, onImported`
- On open, fetches client's primary city location_code, then calls edge function
- **Search input** at top to filter keywords by text
- **Select All** checkbox (applies to visible filtered, non-tracked keywords only)
- Each row: checkbox | keyword text | PositionBadge (colored) | volume/mo
- Already-tracked keywords: greyed out row, disabled checkbox, "Already tracked" label instead of checkbox
- Tracks which keywords are already in the keywords table by querying existing keywords for this client
- **"Add Selected to Tracking"** button in footer with count
- On add: insert into `keywords` table (same pattern as AddKeywordsModal — `client_id + keyword`), trigger `sync-rankings` and `fetch-search-volume`, invalidate queries, show toast, close modal

## Modified Files

### 3. `src/components/dashboard/KeywordsTab.tsx`
- Import `ImportRankedKeywordsModal` and `Download` (or `Import`) icon from lucide
- Add `importOpen` state
- Add "Import Ranked Keywords" button in toolbar (next to "Add Keywords")
- Render `ImportRankedKeywordsModal` at bottom with appropriate props

## Technical Details
- Edge function uses `Deno.env.get("DATAFORSEO_LOGIN")` and `DATAFORSEO_PASSWORD`
- DataForSEO response path: `result[0].items[].keyword_data.keyword`, `.keyword_data.keyword_info.search_volume`, `.ranked_serp_element.serp_item.rank_absolute`
- Already-tracked detection: fetch existing keywords for client_id client-side and compare
- Insert pattern matches AddKeywordsModal (no cross-join with cities needed since AddKeywordsModal doesn't do that either — just `client_id + keyword`)

