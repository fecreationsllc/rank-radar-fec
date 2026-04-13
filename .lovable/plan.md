

# Add Sortable Columns to All Tables + Google Cloud API in Costs

## Part 1: Sortable columns on Keywords table

**File**: `src/components/dashboard/KeywordsTab.tsx`

Add `sortColumn` / `sortDirection` state and a `sortedData` memo (same pattern as SearchConsoleTab). Make all table headers clickable with arrow icons.

Sortable columns: Keyword (string), Landing Page (string), Volume (numeric), Today (numeric), Δ Week (numeric), Last Week (numeric), Last Month (numeric), City (string).

## Part 2: Sortable columns on Costs table

**File**: `src/components/dashboard/CostsTab.tsx`

Add sorting to the "Recent API Calls" log table. Sortable columns: Date, Function, Provider, Endpoint (string), Tasks (numeric), Cost (numeric). Default: Date descending (current order).

## Part 3: Add Google Cloud as a provider in Costs

**File**: `src/components/dashboard/CostsTab.tsx`

Add to `PROVIDER_COLORS` and `PROVIDER_LABELS`:
- `google` → "Google Cloud" with `chart-5` color

This ensures any `api_usage_log` entries with `api_provider = 'google'` display correctly in the chart and table.

Also update the edge functions that call Google APIs (`gsc-auth`, `fetch-gsc-data`) to log their API usage to `api_usage_log` with `api_provider: 'google'`.

**Files**: `supabase/functions/gsc-auth/index.ts`, `supabase/functions/fetch-gsc-data/index.ts`

Add cost logging after successful Google API calls (token exchanges, Search Console data fetches). Use a nominal cost per call since Google Search Console API is free-tier but worth tracking for visibility.

## Part 4: Competitors tab — no table to sort

The Competitors tab uses a card grid layout, not a table. No sorting changes needed there.

## Summary of files changed

1. `src/components/dashboard/KeywordsTab.tsx` — add sortable headers
2. `src/components/dashboard/CostsTab.tsx` — add sortable headers + Google Cloud provider
3. `supabase/functions/fetch-gsc-data/index.ts` — log API usage
4. `supabase/functions/gsc-auth/index.ts` — log API usage

