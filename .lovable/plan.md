

# Bulk-Add GSC Queries to Tracking

## What changes

Single file edit: `src/components/dashboard/SearchConsoleTab.tsx`

## Plan

1. **Select All checkbox in header** — Add a checkbox in the first `<TableHead>` that toggles all visible opportunity (untracked) queries in `selectedQueries`. Checked = all selected, indeterminate = some selected.

2. **Tracked rows get greyed-out checkbox with tooltip** — Instead of showing nothing for tracked rows, show a disabled, greyed-out checkbox wrapped in a `Tooltip` ("Already tracked"). Import `Tooltip`/`TooltipTrigger`/`TooltipContent`/`TooltipProvider` from the existing UI components.

3. **"Add selected to tracking" button** — Place next to the "Sync GSC" button. Shows count badge (e.g. "Add 5 to tracking"). Disabled when `selectedQueries.size === 0` or while adding.

4. **`handleAddToTracking` function** — On click:
   - Fetch `client_cities` for this client to get all city IDs
   - Insert into `keywords` table: one row per selected query (with `client_id`, `keyword`, `status: 'monitoring'`)
   - Use `.upsert()` or handle duplicates with `onConflict` — since the keywords table has no unique constraint on (client_id, keyword), we'll filter out already-tracked keywords client-side (they can't be selected anyway)
   - After insert, trigger `sync-rankings` and `fetch-search-volume` (same pattern as AddKeywordsModal)
   - Show toast with count
   - Invalidate `keywords-list` and `keywords-with-ranks` queries using `useQueryClient`
   - Clear `selectedQueries`

5. **Query client invalidation** — Import `useQueryClient` from `@tanstack/react-query`. After successful insert, call `queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks"] })` and refetch tracked keywords.

## Technical details

- The `sortedData.slice(0, 50)` means Select All only applies to the visible 50 rows
- Opportunity-only selection is already enforced (tracked rows show disabled checkbox, can't be toggled into the set)
- Uses `TooltipProvider` wrapping just the checkbox cell to avoid needing a global provider change
