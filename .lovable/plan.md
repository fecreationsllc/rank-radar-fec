

# Improve keyword suggestions by scraping the actual website

## Problem
The current `suggest-keywords` edge function only sends the domain name and client name to the AI. It never reads the website, so the AI guesses generic keywords rather than discovering the actual services/pages.

## Solution
Update the `suggest-keywords` edge function to:

1. **Fetch the homepage** (`https://{domain}/`) and extract text content
2. **Discover subpages** by parsing links from the homepage that belong to the same domain (e.g. `/services`, `/about`, `/residential-plumbing`)
3. **Fetch up to 5 subpages** in parallel to get service-specific content
4. **Feed all scraped text** (truncated to fit context) into the AI prompt so it can suggest keywords based on actual site content

### File: `supabase/functions/suggest-keywords/index.ts`

Changes:
- Add a `fetchPageText(url)` helper that fetches a URL, strips HTML tags, and returns plain text (truncated to ~2000 chars per page)
- After receiving the request, fetch `https://{domain}/` first
- Parse all same-domain links from the HTML response
- Fetch the top 5 most promising subpages (filtering out assets, anchors, etc.)
- Concatenate all page text (capped at ~10,000 chars total) into the AI prompt
- Update the system prompt to instruct the AI to analyze the provided website content and generate long-tail keywords based on actual services found

### Updated AI prompt structure
```
System: You are an SEO keyword research expert. Analyze the provided 
website content and suggest exactly 20 high-value SEO keywords. 
Include long-tail keywords based on specific services found on the site. 
Focus on local SEO, service-based, and high-intent search terms.

User: Business: {name}
Domain: {domain}
Target City: {city}

--- WEBSITE CONTENT ---
[Homepage]: {scraped text}
[/services]: {scraped text}
[/residential-plumbing]: {scraped text}
...
---

Based on the actual services and content above, suggest 20 keywords.
```

### Error handling
- If the website fetch fails (timeout, SSL error, etc.), fall back to the current behavior (AI guesses from domain/name only)
- Each page fetch has a 5-second timeout to prevent the function from hanging
- Gracefully skip pages that return errors

### No frontend changes needed
The `AddClientModal` already calls this function and displays results. The improvement is entirely server-side.

