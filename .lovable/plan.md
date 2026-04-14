
## Summary
I inspected the codebase and backend records first. The checked-in `supabase/functions/discover-competitors/index.ts` already shows a DataForSEO SERP-based implementation, and recent usage records for `discover-competitors` are already logging `dataforseo` against `serp/google/organic/live`. Anthropic references currently appear in `generate-suggestions`, not in `discover-competitors`. So this looks like a stale/deployed-version mismatch or a need to hard-refresh the function implementation rather than a brand new design.

## Plan
1. **Hard-rewrite `supabase/functions/discover-competitors/index.ts` to the exact SERP-only flow**
   - Remove any remaining Anthropic-specific code paths if present in the deployed function:
     - `ANTHROPIC_API_KEY`
     - Anthropic fetch call
     - AI JSON parsing
     - Anthropic usage logging
   - Keep the existing service-role client and CORS handling.

2. **Implement the real competitor discovery flow**
   - Fetch the client and its primary city.
   - Fetch GSC rows for the client, aggregate by `query`, sum `impressions`, sort descending, and take the top 5 queries.
   - For each query, call DataForSEO `serp/google/organic/live` with Basic auth from `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`.
   - Extract domains from organic results only, normalize them, and count appearances across SERPs with a `Map<string, number>`.

3. **Filter and persist competitors**
   - Exclude:
     - the client’s own domain
     - the blocklisted domains you listed
     - any domain containing `"yelp"` or `"google"`
   - Sort by frequency descending, take the top 6, and upsert:
     - `client_id`
     - `domain`
     - `is_auto_discovered: true`
     - `is_tracked: true`

4. **Keep logging aligned with DataForSEO**
   - Insert into `api_usage_log` with:
     - `api_provider: "dataforseo"`
     - `endpoint: "serp/google/organic/live"`
     - `task_count`: number of SERP calls made
     - `cost_usd: 0.002 * taskCount`

5. **Leave the UI untouched**
   - `CompetitorsTab.tsx` already has the 6-competitor limit and still calls the same function.
   - `AddClientModal.tsx` also already invokes `discover-competitors`, so no caller changes are needed.

## Technical details
- **File to update:** `supabase/functions/discover-competitors/index.ts`
- **No database changes needed**
- **Validation after implementation:**
  - confirm no Anthropic code remains in `discover-competitors`
  - confirm new runs log only `dataforseo` usage for this function
  - confirm returned competitors come from real SERP domains rather than AI-generated output
