

# Add Blocklist Cleanup Step to discover-competitors

## Summary
Before upserting newly discovered competitors, query existing competitors for this client and delete any whose domain is now on the blocklist.

## Change (`supabase/functions/discover-competitors/index.ts`)

Insert a cleanup block between line 187 (the log statement) and line 188 (the "Sort by frequency" comment):

```typescript
// Clean up previously stored competitors that are now on the blocklist
const { data: existingCompetitors } = await supabase
  .from("competitors")
  .select("id, domain")
  .eq("client_id", client_id);

if (existingCompetitors && existingCompetitors.length > 0) {
  const blockedIds = existingCompetitors
    .filter((c) => isBlocked(c.domain))
    .map((c) => c.id);
  if (blockedIds.length > 0) {
    await supabase.from("competitors").delete().in("id", blockedIds);
    console.log(`Removed ${blockedIds.length} blocked competitor(s)`);
  }
}
```

No other changes. Redeploy after editing.

