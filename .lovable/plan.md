

# Replace blocklist cleanup with full auto-discovered wipe

## Summary
Change the cleanup step to delete all auto-discovered competitors for the client before upserting the fresh top 6, instead of only removing blocked ones.

## Change (`supabase/functions/discover-competitors/index.ts`, lines 188-202)

Replace the current blocklist cleanup block with:

```typescript
// Delete all previously auto-discovered competitors for this client
await supabase
  .from("competitors")
  .delete()
  .eq("client_id", client_id)
  .eq("is_auto_discovered", true);

console.log("Cleared old auto-discovered competitors");
```

This is simpler — one delete call filtered by `client_id` + `is_auto_discovered = true`. Manually added competitors (`is_auto_discovered = false`) are untouched.

No other changes. Redeploy the edge function after.

