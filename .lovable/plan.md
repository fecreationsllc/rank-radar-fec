

# Add Raw SERP Response Debug Fields

## Summary
Capture the full raw JSON from the first SERP call to diagnose why zero domains are being extracted despite successful API calls.

## Changes (`supabase/functions/discover-competitors/index.ts`)

1. **Add capture variables** before the SERP loop (after line 125):
   - `let firstSerpRawResponse: any = null;`
   - `let firstSerpItemCount: number = 0;`
   - `let firstSerpStatus: number | null = null;`

2. **Capture first response** inside the loop, right after `const serpData = await serpRes.json();` (line 149):
   ```typescript
   if (taskCount === 0) {
     firstSerpRawResponse = serpData;
     firstSerpItemCount = items.length;
     firstSerpStatus = serpData?.status_code ?? null;
   }
   ```
   Note: must go after `taskCount++` and `items` definition — so capture after line 150, using `taskCount === 1`.

3. **Add to debug output** (lines 207-214):
   ```typescript
   debug: {
     gscRowCount: gscRows?.length || 0,
     searchQueries,
     locationCode: primaryCity.location_code,
     taskCount,
     uniqueDomainsFound: frequencyMap.size,
     serpErrors,
     firstSerpRawResponse,
     firstSerpItemCount,
     firstSerpStatus,
   },
   ```

4. **Redeploy** the edge function.

## No other files changed.

