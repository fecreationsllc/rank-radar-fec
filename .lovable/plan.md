

# Improve keyword suggestion and volume visibility

## Feature 1: Toggle to hide zero/null volume keywords in the table

Add a toggle button in the Keywords tab toolbar that filters out keywords with null or 0 search volume. Clicking again shows all keywords.

**File**: `src/components/dashboard/KeywordsTab.tsx`
- Add state `hideNoVolume` (default false)
- Add a toggle button in the toolbar (e.g. "Hide No Volume" / "Show All")
- Filter `sortedRows` to exclude rows where `searchVolume` is null or 0 when toggle is active
- No keywords are deleted — just visually hidden

## Feature 2: Pre-fetch volume for suggested keywords before showing them

Update the `suggest-more-keywords` edge function to call the DataForSEO Keywords Data API after AI generates suggestions, then return only keywords with volume ≥ 50, along with their volume numbers.

**File**: `supabase/functions/suggest-more-keywords/index.ts`
- After getting the AI-suggested keyword list, call `keywords_data/google_ads/search_volume/live` with those keywords + the client's primary city location_code
- Filter out any keyword with volume < 50 or null
- Return `{ keywords: [{ keyword: string, volume: number }] }` instead of `{ keywords: string[] }`
- Log the extra DataForSEO API cost

**File**: `src/components/dashboard/KeywordsTab.tsx`
- Update `suggestedKeywords` state type from `string[]` to `{ keyword: string; volume: number }[]`
- Pass the new shape to `SuggestKeywordsModal`

**File**: `src/components/dashboard/SuggestKeywordsModal.tsx`
- Update props to accept `{ keyword: string; volume: number }[]`
- Show volume next to each keyword in the list (e.g. "hardwood flooring nyc — 1,200/mo")
- Update select/deselect logic to work with the new object shape
- `onAdd` still passes `string[]` (just the keyword text)

## Files changed
1. `supabase/functions/suggest-more-keywords/index.ts` — add DataForSEO volume lookup + filter ≥ 50
2. `src/components/dashboard/KeywordsTab.tsx` — add hide/show toggle + update suggested keywords type
3. `src/components/dashboard/SuggestKeywordsModal.tsx` — show volume next to each suggestion

