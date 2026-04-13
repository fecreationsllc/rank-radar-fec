

# Add sortable columns to GSC Top Queries table

## What changes
Add click-to-sort on all columns (Query, Clicks, Impressions, CTR, Position, Status) in the Search Console tab's "Top Queries" table.

## Technical approach

**File**: `src/components/dashboard/SearchConsoleTab.tsx`

1. Add `sortColumn` and `sortDirection` state (`useState`)
2. Add a `sortedData` memo that sorts the `aggregated` array based on current sort state (default: impressions desc, matching current behavior)
3. Replace static `<TableHead>` elements with clickable headers showing an arrow indicator (▲/▼) for the active sort column — using `ArrowUpDown` icon from lucide-react
4. Use `sortedData.slice(0, 50)` instead of `aggregated.slice(0, 50)` for rendering

Sort types:
- **Query**: alphabetical string sort
- **Clicks, Impressions, CTR, Position**: numeric sort
- **Status**: sort by `isTracked` boolean (tracked first or last)

Clicking a column header toggles between ascending and descending. Clicking a different column switches to that column with a sensible default direction (desc for numeric, asc for text).

No new dependencies needed — just state management and a sort function within the existing component.

