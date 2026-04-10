

# RankRadar — SEO Keyword Rank Tracking App

## Overview
A full-stack SEO agency dashboard for tracking Google keyword rankings across client locations, with shareable public reports, competitor discovery, and AI-generated suggestions.

## Database (Supabase Migrations)
- Create all 6 tables: `clients`, `client_cities`, `keywords`, `competitors`, `rank_history`, `seo_suggestions`
- Add performance indexes on `rank_history`
- Enable RLS on all tables: authenticated users get full access; public SELECT on `clients`, `keywords`, `rank_history`, `client_cities`, `seo_suggestions` for the report page

## Authentication
- Email + password login via Supabase Auth
- Protected route wrapper redirecting unauthenticated users to `/login`
- Single agency login — no client accounts

## Pages & UI

### `/login`
- Clean email/password form, redirects to `/` on success

### `/` — Dashboard (protected)
- **Dark sidebar** (#111827) listing all clients with colored dots, name, domain, and "+ Add Client" button
- **Main area** with client name/domain header and tab switcher: Keywords | Competitors | Suggestions | Settings

- **Keywords tab**: 4 stat cards (Avg Position, Top 10, Improved, Declined), search/filter bar, add keywords button, sync button, data table with position badges (color-coded), weekly/monthly change indicators, sparkline trends, city pills, remove button

- **Competitors tab**: Competitor count, auto-discover button, add competitor button, grid of competitor cards with domain, badges, tracked toggle, overlap stats

- **Suggestions tab**: 3 ranked AI suggestion cards with impact/effort badges, keyword pills, generation date, regenerate button

- **Settings tab**: Edit client info, manage cities with DataForSEO location autocomplete, shareable report link with copy button, delete client danger zone

### `/report/:token` — Public Report (no auth)
- Polished client-facing report with header, 3 summary stat cards, color-coded keyword rankings table, AI suggestions section, competitor comparison, footer

## Modals
- **Add Client** (4-step wizard): Basic info → City search via DataForSEO locations API → Keyword paste/parse → Success with report link and first sync button
- **Add Keywords**: Textarea with parsing, optional target URL, preview list

## Edge Functions

### `sync-rankings`
- Scheduled nightly at 02:00 UTC via pg_cron, also callable on-demand per client
- Posts keyword batches to DataForSEO standard queue, waits 60s, fetches results
- Stores positions in `rank_history` (null if not in top 100)
- Sends rank drop alerts (≥10 position drop) via Resend
- Triggers `generate-suggestions` on 1st of month

### `discover-competitors`
- Calls DataForSEO competitors_domain endpoint for client's primary city
- Inserts top 7 auto-discovered competitors via upsert

### `generate-suggestions`
- Analyzes 60 days of rank history, identifies quick wins and declining keywords
- Calls Claude API with structured prompt requiring plain-English recommendations
- Stores 3 ranked suggestions as JSONB

## Environment Variables
User will be prompted to add: `VITE_DATAFORSEO_LOGIN`, `VITE_DATAFORSEO_PASSWORD`, `VITE_RESEND_API_KEY`, `VITE_ANTHROPIC_API_KEY`

## Styling
- Dark sidebar with white main content area
- Position badges: teal (1-3), blue (4-10), amber (11-30), grey (31-100)
- Green ↑ / red ↓ for rank changes
- Skeleton loading states, 12px border-radius cards with subtle borders
- Monospace font for position numbers

