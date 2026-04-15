
# Per-Client Google Search Console Connections

## Summary
Allow each client to optionally connect its own Google account for GSC data, falling back to the global shared connection.

## 1. New database table: `client_gsc_connections`

```sql
CREATE TABLE public.client_gsc_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_gsc_connections ENABLE ROW LEVEL SECURITY;
-- authenticated + service_role full access policies
```

One row per client. The `UNIQUE` on `client_id` ensures at most one connection per client.

## 2. Update `gsc-auth` edge function

Add optional `client_id` parameter to all actions:

- **`get_auth_url`**: Encode `client_id` into the OAuth `state` param so it survives the redirect.
- **`exchange_code`**: Accept `client_id` (from body or parsed from `state`). If present, upsert into `client_gsc_connections`; otherwise upsert into global `gsc_connections`.
- **`disconnect`**: If `client_id` provided, delete from `client_gsc_connections` for that client.
- **`status`**: If `client_id` provided, return `{ client_connected, global_connected, client_connected_at, global_connected_at }`.

## 3. Update `fetch-gsc-data` edge function

In the handler, before falling back to the global `gsc_connections` row:
1. Query `client_gsc_connections` WHERE `client_id` matches.
2. If found, use that token (refresh if needed).
3. If not found, fall back to `gsc_connections` (existing behavior).

The `refreshToken` helper already works generically — just pass the right table name for updates.

## 4. Update `SettingsTab.tsx` UI

Replace the current binary connected/not-connected GSC card with three states:

| State | UI |
|---|---|
| Client has own connection | ✅ "Connected (dedicated)" + Disconnect button |
| No client connection, but global exists | 🔗 "Using shared connection" + "Connect own account" button |
| Neither connected | ❌ "Not connected" + "Connect" button |

Pass `client_id` in the `gsc-auth` invocations. On OAuth callback, parse `state` to recover `client_id`.
