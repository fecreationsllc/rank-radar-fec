

# Add "Suggest More Keywords" feature to the Keywords tab

## What it does
Adds a button to the Keywords tab toolbar that uses AI to analyze the client's existing keywords, website content, and city — then suggests additional keywords that would complement the current list. Users can review and selectively add them.

## Changes

### 1. New edge function: `suggest-more-keywords`
File: `supabase/functions/suggest-more-keywords/index.ts`

- Accepts `{ client_id }` 
- Fetches the client's existing keywords, domain, name, and city from the database
- Reuses the same website scraping logic from `suggest-keywords` (fetch homepage + subpages, strip HTML)
- Sends to Lovable AI (`google/gemini-3-flash-preview`) with a prompt like: "Here are the keywords this business already tracks: [...]. Based on the website content and their current keyword strategy, suggest 15 additional keywords they should add. Focus on gaps — related services, long-tail variations, and local intent keywords they're missing."
- Uses tool calling to return structured `{ keywords: string[] }`
- Filters out any keywords already in the existing list

### 2. Update `src/components/dashboard/KeywordsTab.tsx`

- Add a "Suggest Keywords" button (with `Sparkles` icon) to the toolbar next to "Add Keywords" and "Sync Now"
- On click, invoke `suggest-more-keywords` edge function
- Show a modal/dialog with the suggested keywords as a checklist (all checked by default)
- User can uncheck any they don't want, then click "Add Selected" to insert them into the `keywords` table
- Show loading state while AI generates suggestions

### Technical details
- The edge function uses `LOVABLE_API_KEY` (already available) and the Lovable AI gateway
- Suggested keywords are deduplicated against existing keywords server-side
- The add flow reuses the same insert logic as `AddKeywordsModal`

