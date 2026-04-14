

# Rewrite discover-competitors to Use Anthropic AI + Enforce 6-Competitor Limit

## Summary
Replace DataForSEO competitors_domain call with Anthropic Claude, feeding it the client's keywords and GSC data to suggest realistic local competitors. Enforce a max of 6 competitors in the UI.

## Changes

### 1. Rewrite `supabase/functions/discover-competitors/index.ts`
- Remove all DataForSEO logic
- After getting client + primary city, fetch:
  - Keywords: `keywords` table where `client_id` matches, limit 30, select `keyword, status`
  - GSC queries: `gsc_query_data` ordered by impressions desc, limit 30, select `query, impressions, position`
- Call Anthropic Messages API (`https://api.anthropic.com/v1/messages`) with `ANTHROPIC_API_KEY`, model `claude-sonnet-4-20250514`, max_tokens 1024
- Prompt includes: domain, city name, tracked keywords with statuses, top GSC queries with impressions — asks for JSON array of exactly 6 local competitor domains, explicitly excluding national brands/aggregators (yelp, homeadvisor, thumbtack, etc.)
- Parse JSON from response content, filter out client's own domain, take up to 6
- Map to `{ client_id, domain, is_auto_discovered: true, is_tracked: true }` and upsert with `onConflict: "client_id,domain"`
- Log to `api_usage_log` with provider "anthropic", endpoint "messages", cost 0.003

### 2. Update `src/components/dashboard/CompetitorsTab.tsx`
- Compute `atLimit = competitors.length >= 6`
- Wrap Auto-discover and Add Competitor buttons in `Tooltip` when `atLimit` — show "Maximum 6 competitors reached", buttons disabled
- Import `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` from UI components

## Files changed
- `supabase/functions/discover-competitors/index.ts` — full rewrite
- `src/components/dashboard/CompetitorsTab.tsx` — add 6-competitor limit enforcement

