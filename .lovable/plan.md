

# Refactor ImportRankedKeywordsModal to Use GSC Data

## Summary
Replace the DataForSEO edge function call with a direct query to `gsc_query_data` table, showing GSC queries with position and impressions instead of search volume.

## Changes (single file: `src/components/dashboard/ImportRankedKeywordsModal.tsx`)

1. **Update `RankedKeyword` interface** — Replace `volume: number` with `impressions: number`

2. **Replace `fetchData` logic** — Remove the `supabase.functions.invoke("get-ranked-keywords", ...)` call. Instead query `gsc_query_data` directly:
   - `supabase.from("gsc_query_data").select("*").eq("client_id", clientId).order("impressions", { ascending: false })`
   - Aggregate duplicate queries (same query text across dates): take max impressions, average position rounded to nearest int
   - Map to `{ keyword: row.query, position: Math.round(avgPosition), impressions: totalImpressions }`

3. **Update display** — Change volume column header/values from `{volume.toLocaleString()}/mo` to `{impressions.toLocaleString()}` with header "Impr."

4. **Update empty state message** — Change from "No ranked keywords found for this domain." to "No GSC data available. Sync Google Search Console from the Search Console tab first."

5. **Remove `clientDomain` usage** — No longer needed since we query by `clientId` directly. Remove from props interface and the loading message. Also remove the primary city lookup since location_code is no longer needed.

6. **Update modal title/icon** — Keep as-is or minor text tweak to reflect GSC source.

## Props change
- Remove `clientDomain` from `ImportRankedKeywordsModalProps` (no longer needed)
- Update `KeywordsTab.tsx` to stop passing `clientDomain`

## No database or edge function changes needed

