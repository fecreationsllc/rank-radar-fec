

# Add Debug Output to discover-competitors

## Summary
Add a `debug` field to the success response and collect SERP errors into a `serpErrors` array for visibility.

## Changes (`supabase/functions/discover-competitors/index.ts`)

1. **Add `serpErrors` array** — declare `const serpErrors: string[] = [];` alongside `frequencyMap` and `taskCount` (around line 123).

2. **Capture SERP errors** — in the catch block (line 162-164), push the error message: `serpErrors.push(\`SERP failed for "\${keyword}": \${(e as Error).message}\`);`

3. **Add debug field to response** — change the return (line 203) to include:
   ```json
   {
     "competitors": allCompetitors,
     "debug": {
       "gscRowCount": gscRows?.length || 0,
       "searchQueries": searchQueries,
       "locationCode": primaryCity.location_code,
       "taskCount": taskCount,
       "uniqueDomainsFound": frequencyMap.size,
       "serpErrors": serpErrors
     }
   }
   ```

## No other files changed. Function will be redeployed after edit.

