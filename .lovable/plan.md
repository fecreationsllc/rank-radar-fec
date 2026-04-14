

# Fix DataForSEO SERP API URL

## Summary
Change the SERP endpoint from `/live` to `/live/advanced` to fix the 40400 "Not Found" error.

## Change
**File:** `supabase/functions/discover-competitors/index.ts`

Replace:
```
https://api.dataforseo.com/v3/serp/google/organic/live
```
With:
```
https://api.dataforseo.com/v3/serp/google/organic/live/advanced
```

Also update the `api_usage_log` endpoint string to match: `"serp/google/organic/live/advanced"`.

Redeploy the edge function after.

