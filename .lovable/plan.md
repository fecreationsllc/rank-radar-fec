

# Integrate Google Search Console (GSC) Data

## Overview
Connect your single Google account to pull GSC data (top queries, clicks, impressions, CTR, avg position) per client domain. This data appears in a new "Search Console" tab and enriches keyword suggestions.

## How it works

Since there's no built-in GSC connector, we need Google OAuth with the `webmasters.readonly` scope. You'll create a Google OAuth app once, and the tool stores the refresh token to keep pulling data.

## Changes

### 1. Google OAuth setup (one-time, per agency)
- Store `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as secrets
- New edge function `gsc-auth` handles the OAuth flow (authorization URL + token exchange)
- Store the refresh token in a new `gsc_connections` table
- A small "Connect Google" button in Settings initiates the flow

### 2. New database tables

**`gsc_connections`** — stores OAuth credentials per agency (single row since single account)
- `id`, `access_token`, `refresh_token`, `token_expires_at`, `created_at`

**`gsc_query_data`** — cached GSC query performance data per client
- `id`, `client_id`, `query`, `clicks`, `impressions`, `ctr`, `position`, `date`, `fetched_at`

### 3. New edge function: `fetch-gsc-data`
- Accepts `{ client_id }`
- Reads the client's domain, refreshes the OAuth token if needed
- Calls GSC Search Analytics API (`searchAnalytics/query`) for the last 28 days
- Groups by query, stores top queries in `gsc_query_data`
- Logs cost as $0.00 (GSC API is free)

### 4. New tab: "Search Console" in ClientDashboard
- Summary cards: total clicks, total impressions, avg CTR, avg position (from GSC)
- Table of top queries sorted by impressions, showing clicks, impressions, CTR, position
- Highlight queries that aren't in the tracked keywords list (opportunity indicator)
- "Sync GSC" button to pull fresh data
- If not connected yet, show a "Connect Google Search Console" prompt

### 5. Settings update
- Add a "Google Search Console" card in Settings tab
- Shows connection status (connected/not connected)
- "Connect" button triggers OAuth flow
- "Disconnect" button to remove credentials

### 6. Feed GSC into keyword suggestions
- Update `suggest-more-keywords` edge function to include top GSC queries (not yet tracked) as context for the AI, so suggestions are informed by real search data

### Files to create/edit
1. **Migration** — `gsc_connections` + `gsc_query_data` tables with RLS
2. **`supabase/functions/gsc-auth/index.ts`** — OAuth flow (auth URL + token exchange)
3. **`supabase/functions/fetch-gsc-data/index.ts`** — Pull GSC data for a client
4. **`src/components/dashboard/SearchConsoleTab.tsx`** — New tab UI
5. **`src/components/dashboard/ClientDashboard.tsx`** — Add Search Console tab
6. **`src/components/dashboard/SettingsTab.tsx`** — Add GSC connection card
7. **`supabase/functions/suggest-more-keywords/index.ts`** — Include GSC queries as context

### Setup required from you
- Create a Google Cloud project with Search Console API enabled
- Create OAuth 2.0 credentials (Web application type)
- Provide `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — I'll prompt you to add these as secrets

