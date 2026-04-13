

# Add API Cost Tracker

## Two issues to address

### 1. Stats showing correctly
The sync worked — the site just doesn't rank in the top 100 for those keywords, hence null positions. The stat cards (Avg Position, Top 10, etc.) correctly show 0/—. No code fix needed here. Search volumes showing "—" may be because DataForSEO returned no volume data for those keywords in that location — I can investigate further if needed.

### 2. Cost Calculator tab

Track all operational costs: DataForSEO (rankings + search volume), AI (keyword suggestions, SEO suggestions), and email alerts.

#### New database table: `api_usage_log`
```sql
CREATE TABLE api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  function_name text NOT NULL,
  api_provider text NOT NULL,        -- 'dataforseo', 'lovable_ai', 'resend'
  endpoint text,
  task_count integer DEFAULT 1,
  cost_usd numeric(10,6) NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

#### Cost rates (hardcoded in edge functions)
| API Call | Cost per unit |
|----------|--------------|
| DataForSEO SERP task_post | $0.002 per task (1 task = 1 keyword×city) |
| DataForSEO search_volume | $0.05 per request (up to 700 keywords) |
| Lovable AI (gemini-3-flash) | ~$0.001 per call (estimate) |
| Resend email | $0.00 (free tier) |

#### Edge function updates
Add cost logging to each function after successful API calls:
- `sync-rankings` — log DataForSEO SERP costs (task count × $0.002)
- `fetch-search-volume` — log DataForSEO volume costs (request count × $0.05)
- `suggest-more-keywords` — log AI cost
- `suggest-keywords` — log AI cost
- `generate-suggestions` — log AI cost
- `discover-competitors` — log DataForSEO cost

#### New "Costs" tab in ClientDashboard
- Add a "Costs" tab next to Settings in the nav
- Show: total spend (all time), spend this month, spend by API provider (pie/bar chart)
- Table of recent API calls with date, function, provider, task count, cost
- Global summary across all clients at the top

### Files to change
1. **Migration** — create `api_usage_log` table with RLS
2. **All 6 edge functions** — add cost logging after API calls
3. **New component** `src/components/dashboard/CostsTab.tsx` — cost display UI
4. **`ClientDashboard.tsx`** — add Costs tab to nav

