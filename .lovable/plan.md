

# Fix blank white screen on "Suggest More" keywords

## Problem
When you click "Suggest More," the edge function scrapes your website (homepage + up to 5 subpages) and calls the AI gateway. This can take 15-30 seconds, which likely exceeds the edge function timeout. When it times out, the response isn't valid JSON, causing an unhandled error that crashes the React app into a white screen.

## Fix — Two parts

### 1. Add error boundary protection in KeywordsTab
Wrap the `supabase.functions.invoke` call with better error handling to catch non-JSON responses and timeout errors, preventing the app crash.

**File**: `src/components/dashboard/KeywordsTab.tsx`
- Check if `data` contains an error field (edge function returns `{error: ...}` on failure)
- Ensure `setSuggesting(false)` always runs even on unexpected errors
- Show a toast with a helpful message instead of crashing

### 2. Add timeout and reduce scraping in the edge function
Make the edge function faster and more resilient.

**File**: `supabase/functions/suggest-more-keywords/index.ts`
- Reduce subpage scraping from 5 to 2 pages (biggest time saver)
- Reduce content per page from 2000 to 1000 chars
- Add a shorter fetch timeout (3s instead of 5s per page)
- Wrap the entire handler in a try/catch that always returns valid JSON

### 3. Add React ErrorBoundary around the modal
Add a simple error boundary so even if something unexpected happens, the app doesn't go white — it shows a fallback UI instead.

**File**: `src/components/dashboard/SuggestKeywordsModal.tsx`
- Wrap content in an error boundary that catches render errors

## Summary
The root cause is the edge function taking too long and returning a non-JSON error. The fix makes the function faster and ensures the frontend handles errors gracefully instead of crashing.

