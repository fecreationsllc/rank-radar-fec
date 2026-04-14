

# Update discover-competitors: add retailer blocklist, clean up debug

## Changes (single file: `supabase/functions/discover-competitors/index.ts`)

1. **Add 15 retailer domains to BLOCKLIST** (lines 10-33): Add `"homedepot.com"`, `"lowes.com"`, `"walmart.com"`, `"costco.com"`, `"target.com"`, `"bestbuy.com"`, `"wayfair.com"`, `"overstock.com"`, `"ikea.com"`, `"flooranddecor.com"`, `"builddirect.com"`, `"houzz.com"`, `"samsclub.com"`, `"menards.com"`, `"acehardware.com"`.

2. **SERP URL already correct** — line 133 already has `/live/advanced`. No change needed.

3. **api_usage_log endpoint already correct** — line 204 already says `"serp/google/organic/live/advanced"`. No change needed.

4. **Remove debug variables** (lines 125-128): Remove `serpErrors`, `firstSerpRawResponse`, `firstSerpItemCount`, `firstSerpStatus` declarations.

5. **Remove debug capture** (lines 155-159): Remove the `if (taskCount === 1)` block.

6. **Remove serpErrors push** (line 174): Remove the `serpErrors.push(...)` line from the catch block.

7. **Clean response** (lines 214-229): Return only `{ competitors: allCompetitors }` — remove the entire `debug` object.

8. **Redeploy** the edge function.

