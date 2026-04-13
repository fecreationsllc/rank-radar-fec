

# Set up weekly automatic ranking sync

## Problem
There is no scheduled job — `pg_cron` and `pg_net` extensions are not enabled. Rankings only update when you manually trigger "Sync Now."

## Plan

### 1. Enable `pg_cron` and `pg_net` extensions
Database migration to enable both extensions needed for scheduled HTTP calls.

### 2. Create weekly cron job
Schedule `sync-rankings` to run every Monday at 6:00 AM UTC via `cron.schedule()` calling `net.http_post()` to the edge function endpoint.

### 3. No code changes needed
The `sync-rankings` edge function already works — it just needs to be triggered automatically.

### Technical detail
```sql
-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule weekly sync (inserted via read query tool, not migration, since it contains project-specific URLs)
SELECT cron.schedule(
  'weekly-sync-rankings',
  '0 6 * * 1',  -- Every Monday 6 AM UTC
  $$
  SELECT net.http_post(
    url:='https://efjipsvuymqnvgyqqycx.supabase.co/functions/v1/sync-rankings',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmamlwc3Z1eW1xbnZneXFxeWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDI4NzgsImV4cCI6MjA5MTUxODg3OH0.fIqB2Fb-6drAXAHlk83jwx4S1HZs9-RqnoFdu9meJB8"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
```

### Note on null positions
The last sync ran successfully but your domain wasn't found in the top 100 for those keywords. This is expected if the site is new or doesn't rank for those terms yet — not a bug.

