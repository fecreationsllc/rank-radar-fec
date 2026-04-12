

# Add search volume to keywords table

## Approach
Use DataForSEO's Keywords Data API (`/v3/keywords_data/google_ads/search_volume/live`) to fetch monthly search volume for each keyword+location pair. Store it in a new `keyword_search_volume` table (per keyword + city) and display it in the keywords table.

## Changes

### 1. New database table: `keyword_search_volume`
```sql
CREATE TABLE keyword_search_volume (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES client_cities(id) ON DELETE CASCADE,
  search_volume integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(keyword_id, city_id)
);
```
With RLS policies matching existing tables (authenticated full access, public read, service role full access).

### 2. New edge function: `fetch-search-volume`
- Accepts `{ client_id }`
- Fetches all keywords and cities for the client
- Calls DataForSEO Keywords Data API with keywords + location codes in a single batch
- Upserts results into `keyword_search_volume`
- Uses existing `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` secrets

### 3. Update `sync-rankings` edge function
- After ranking sync completes, also trigger `fetch-search-volume` for the client (so volume stays fresh alongside ranks)

### 4. Update `KeywordsTab.tsx`
- Join `keyword_search_volume` data into the query (match on keyword_id + city_id)
- Add a "Volume" column to the table showing the monthly search volume with number formatting
- Add volume to the `KeywordWithRanks` interface
- Show "—" when no volume data exists yet

### 5. Update `Report.tsx`
- If the report page also shows keywords, add volume column there too (will check if needed)

## No new API keys needed
DataForSEO credentials are already configured.

