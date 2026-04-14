

# Rewrite discover-competitors to Use Real SERP Data

## Summary
Replace Anthropic AI competitor discovery with actual DataForSEO SERP lookups. Query Google for the client's top GSC keywords and extract real competing domains from the organic results.

## Changes (single file: `supabase/functions/discover-competitors/index.ts`)

### Full rewrite logic:

1. **Get client + primary city** — same as current code

2. **Get search queries to use** — Query `gsc_query_data` for this client, aggregate by query (sum impressions), sort desc, take top 5. If no GSC data, fall back to `keywords` table sorted by `latest_position` ASC (best-ranked first), limit 5, using the `keyword` field.

3. **SERP lookups** — For each query, call DataForSEO `POST https://api.dataforseo.com/v3/serp/google/organic/live` with `[{ keyword, location_code, language_code: "en", depth: 20 }]`. Use `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` from env (Basic auth).

4. **Extract domains** — From each response at `tasks[0].result[0].items`, filter for `type === "organic"`, extract `item.domain`.

5. **Build frequency map** — Count how many of the 5 SERPs each domain appears in.

6. **Filter blocklist** — Remove client's own domain and blocklisted domains: yelp.com, yellowpages.com, homeadvisor.com, angi.com, thumbtack.com, bbb.org, google.com, facebook.com, instagram.com, twitter.com, linkedin.com, pinterest.com, youtube.com, amazon.com, wikipedia.org, reddit.com, nextdoor.com, mapquest.com, apple.com, plus any domain containing "yelp" or "google".

7. **Sort by frequency desc, take top 6** — Upsert into `competitors` with `is_auto_discovered: true, is_tracked: true`.

8. **Log usage** — provider "dataforseo", endpoint "serp/google/organic/live", task_count = number of SERP calls made, cost_usd = 0.002 × task_count.

### Key technical notes
- DataForSEO auth: Basic auth with `btoa(LOGIN:PASSWORD)`
- `gsc_query_data` may have multiple rows per query (different dates) — aggregate with a Map, sum impressions
- The `keywords` table doesn't have a `latest_position` column per the schema — fallback will just take first 5 keywords ordered by `created_at` ASC (longest-tracked)
- No changes to CompetitorsTab.tsx

