

# Add Sync Progress Indicator

## What changes
Add a progress bar with completed/total count that appears above the keywords table during sync polling, replacing the invisible background polling with clear visual feedback.

## Technical approach

**File**: `src/components/dashboard/KeywordsTab.tsx`

1. Add two new state variables: `syncTotal` (total tasks queued) and `syncCompleted` (tasks completed so far)
2. Set `syncTotal` from the `task_count` returned by `sync-rankings`
3. During each poll cycle, update `syncCompleted` from `pollData.completed`
4. Reset both to 0 when syncing finishes
5. Render a progress banner (conditionally when `syncing`) between the toolbar and the table:
   - Uses the existing `Progress` component (`@/components/ui/progress`)
   - Shows text like "Syncing rankings... 3 of 8 completed"
   - Progress bar fills based on `(syncCompleted / syncTotal) * 100`
   - Subtle card with a RefreshCw spinning icon, the text, and the progress bar

No new files or dependencies needed — just state + the existing `Progress` UI component.

