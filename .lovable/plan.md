
# 6 Improvements Plan

## 1. Keyword Sync Feedback (KeywordsTab)
Add loading spinner + disabled state to "Sync Now" button while `sync-rankings` runs. Show success toast with result count or error toast on failure — same pattern as GSC sync button.

**Files:** `src/components/dashboard/KeywordsTab.tsx`

## 2. Volume Note for N/A Keywords (KeywordsTab)
When any keyword shows "N/A" for search volume, render a small info banner: "Volume data typically updates within 24 hours." Hide once all keywords have volume.

**Files:** `src/components/dashboard/KeywordsTab.tsx`

## 3. Add-to-Tracking Button on Suggestions (SuggestionsTab)
When a suggestion recommends tracking a keyword, show an inline "Add to Tracking" button. On click: insert into `keywords` with status `monitoring`, trigger background `sync-rankings` + `fetch-search-volume`, show toast, invalidate queries.

**Files:** `src/components/dashboard/SuggestionsTab.tsx`

## 4. Competitor Shared Keyword Count (CompetitorsTab)
For each competitor card, count how many of the client's tracked keywords also appear in that competitor's SERP results (via `rank_history`). Display "X shared keywords" on each card.

**Files:** `src/components/dashboard/CompetitorsTab.tsx`

## 5. Rank Drop Email Alerts (Edge Function)
Create `send-rank-alerts` edge function:
- Query latest two rank checks per keyword per city
- Identify drops of 5+ positions
- Send email via Resend API (`RESEND_API_KEY` already configured) to `client.alert_email` or fallback `fecreationsllc@gmail.com`
- Use `api_usage_log` or a simple dedup mechanism to avoid duplicate alerts

**Files:** `supabase/functions/send-rank-alerts/index.ts`

## 6. Keyword Trend Sparkline (KeywordsTab)
Add "Trend" column with a small sparkline showing 30-day position history from `rank_history`. Reuse existing `Sparkline` component. Fetch rank history alongside keyword data.

**Files:** `src/components/dashboard/KeywordsTab.tsx`, `src/components/Sparkline.tsx`
