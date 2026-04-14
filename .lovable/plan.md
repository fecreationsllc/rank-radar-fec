

# Rewrite discover-competitors with DataForSEO SERP + location_code

## Summary
Complete rewrite of `supabase/functions/discover-competitors/index.ts` from scratch. Zero Anthropic code. Uses DataForSEO SERP API with `location_code` (not `location_name`) per user preference.

## Single file change: `supabase/functions/discover-competitors/index.ts`

Write the entire file from scratch with this logic:

1. **Imports**: `serve` from deno std, `createClient` from supabase-js. Define `corsHeaders`.

2. **Handler**: OPTIONS check → parse `client_id` from body → create supabase service client.

3. **Fetch client + primary city**:
   - `clients` table `.eq("id", client_id).single()`
   - `client_cities` table `.eq("client_id", client_id).eq("is_primary", true).limit(1)`

4. **Get top 5 GSC queries** (simple approach — no aggregation needed since we just want top queries):
   - `supabase.from("gsc_query_data").select("query, impressions").eq("client_id", client_id).order("impressions", { ascending: false }).limit(50)`
   - Deduplicate by query in JS using a Map (sum impressions), sort desc, take top 5
   - If none found, fall back to `keywords` table `.eq("client_id", client_id).order("created_at", { ascending: true }).limit(5)` using `.keyword` field
   - If still none, throw error

5. **DataForSEO SERP calls**: For each query, POST to `https://api.dataforseo.com/v3/serp/google/organic/live`:
   ```
   [{ keyword: query, location_code: primaryCity.location_code, language_code: "en", depth: 20 }]
   ```
   Auth: `"Basic " + btoa(DATAFORSEO_LOGIN + ":" + DATAFORSEO_PASSWORD)`

6. **Extract & count domains**: From `serpData.tasks?.[0]?.result?.[0]?.items`, filter `type === "organic"`, get `item.domain`, strip `www.`, increment frequency map.

7. **Blocklist filter**: Exclude client's own domain + these domains: yelp.com, yellowpages.com, homeadvisor.com, angi.com, thumbtack.com, bbb.org, google.com, facebook.com, instagram.com, twitter.com, linkedin.com, pinterest.com, youtube.com, amazon.com, wikipedia.org, reddit.com, nextdoor.com, mapquest.com, apple.com, x.com, manta.com, angieslist.com. Also exclude any domain containing "yelp" or "google".

8. **Sort by frequency desc, take top 6**. Upsert to `competitors` with `{ client_id, domain, is_auto_discovered: true, is_tracked: true }`, onConflict `"client_id,domain"`.

9. **Log usage**: Insert to `api_usage_log` with provider `"dataforseo"`, endpoint `"serp/google/organic/live"`, task_count = number of SERP calls, cost_usd = 0.002 × task_count.

10. **Return** all competitors for the client.

11. **Deploy** the edge function after writing.

## No other files changed

