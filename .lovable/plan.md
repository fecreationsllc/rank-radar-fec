

# Fix: SearchConsoleTab white screen (Rules of Hooks violation)

## Root cause
The `useMemo` hook for `sortedData` (line ~192) runs **after** an early return on line 73. When GSC is not connected, the component returns early, skipping the `useMemo` call. React detects a different number of hooks between renders and crashes.

## Fix

**File**: `src/components/dashboard/SearchConsoleTab.tsx`

Move the `useMemo` for `sortedData` **above** the early return (alongside the other hooks at the top of the component). The aggregation logic that `sortedData` depends on also needs to move above the early return — wrap it in a `useMemo` as well so it doesn't recompute on every render.

Specifically:
1. Move the aggregation logic (lines 85-115) into a `useMemo` that depends on `gscData` and `trackedKeywords`, placed before the early return
2. Move the `sortedData` `useMemo` (line ~192) above the early return
3. Move the `handleSort` function and `SortIcon` component above the early return
4. The early return stays — it just comes after all hooks

This ensures all hooks are called on every render regardless of connection status.

## Files changed
1. `src/components/dashboard/SearchConsoleTab.tsx` — reorder hooks above early return

