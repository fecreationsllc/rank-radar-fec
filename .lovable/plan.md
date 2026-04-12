

# Auto-suggest keywords using AI when adding a client

## Problem
During the "Add Client" flow at step 3 (Keywords), users must manually type/paste keywords. The client's domain is already known from step 1, so we can use AI to analyze what the business likely targets and suggest 20 relevant keywords automatically.

## Solution

### 1. New edge function: `suggest-keywords`
**File: `supabase/functions/suggest-keywords/index.ts`**

- Accepts `{ domain, client_name, city_name }` in the request body
- Uses Lovable AI (gateway) to generate 20 SEO keywords based on the domain, business name, and target city
- Returns `{ keywords: ["keyword1", "keyword2", ...] }`
- The prompt will instruct the model to infer the business type from the domain/name and suggest high-value local SEO keywords

### 2. Update AddClientModal (step 3)
**File: `src/components/dashboard/AddClientModal.tsx`**

- When step 3 loads, automatically call `suggest-keywords` with the client's domain, name, and primary city
- Show a loading spinner/state ("Analyzing website...")
- Once results arrive, populate the textarea with the 20 suggested keywords (one per line)
- User can edit, add, or remove keywords before saving
- Add a "Regenerate" button to re-fetch suggestions if needed

### Technical details

**Edge function** uses the Lovable AI gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) with `LOVABLE_API_KEY` (already available). Model: `google/gemini-3-flash-preview`. The prompt asks for exactly 20 keywords as a JSON array, using tool calling for structured output.

**Frontend** triggers the call via `supabase.functions.invoke("suggest-keywords", { body: { domain, client_name, city_name } })` inside a `useEffect` when `step === 3`.

